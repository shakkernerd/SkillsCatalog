#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.version) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  if (!isSemverLike(options.version)) {
    throw new Error("version must look like 1.2.3 or 1.2.3-beta.1");
  }

  const version = options.version;
  const remote = options.remote;
  const tag = `v${version}`;
  const releaseCommitMessage = `chore: bump version to ${version}`;

  const branch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true })).stdout.trim();
  if (branch !== "main") {
    throw new Error(`releases must be prepared from the main branch (current: ${branch || "detached"})`);
  }
  await git(["remote", "get-url", remote]);

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const packageName = packageJson.name;
  const currentVersion = packageJson.version;
  if (!packageName || !currentVersion) {
    throw new Error("package.json must include name and version");
  }

  const dirtyFiles = await trackedDirtyFiles();
  const untracked = await untrackedFiles();
  if (untracked.length > 0) {
    throw new Error(`untracked files are present; add, commit, or remove them before running release prep:\n${untracked.join("\n")}`);
  }
  const headSha = (await git(["rev-parse", "HEAD"])).stdout.trim();
  const headSubject = (await git(["log", "-1", "--pretty=%s"])).stdout.trim();
  const headIsReleaseCommit = headSubject === releaseCommitMessage;
  let localTagSha = await refCommit(tag);
  let remoteTagSha = await remoteTagCommit(remote, tag);
  let remoteMainSha = await remoteRefCommit(remote, "refs/heads/main");
  if (remoteMainSha && !(await isAncestor(remoteMainSha, headSha))) {
    throw new Error(`local main does not contain ${remote}/main; pull or rebase before preparing a release`);
  }

  if (localTagSha && localTagSha !== headSha) {
    throw new Error(`local tag ${tag} already exists and does not point at HEAD`);
  }
  if (remoteTagSha && remoteTagSha !== headSha) {
    throw new Error(`remote tag ${tag} already exists on ${remote} and does not point at HEAD`);
  }

  let needUpdateVersion = false;
  let needChecks = false;
  let needCommit = false;

  log(`Preparing release ${tag} from branch ${branch} using remote ${remote}`);

  if (currentVersion === version) {
    if (dirtyFiles.length > 0) {
      if (!(await dirtyFilesMatchReleaseVersion(dirtyFiles, version))) {
        throw new Error("tracked changes are present; commit or stash them before running release prep");
      }
      if (headIsReleaseCommit || localTagSha || remoteTagSha) {
        throw new Error(`version files are dirty for ${version}, but a release commit or tag already exists`);
      }
      log(`resume state: version files already updated to ${version}`);
      needChecks = true;
      needCommit = true;
    } else {
      if (!headIsReleaseCommit) {
        throw new Error(`${packageName} is already on ${version}, but HEAD is not the expected release commit`);
      }
      log(`resume state: release commit already exists at ${headSha.slice(0, 7)}`);
      if (localTagSha) log(`resume state: local tag ${tag} already exists`);
      if (remoteTagSha) log(`resume state: remote tag ${tag} already exists on ${remote}`);
      if (remoteMainSha === headSha) log(`resume state: main is already pushed to ${remote}`);
    }
  } else {
    if (dirtyFiles.length > 0) {
      throw new Error("tracked changes are present; commit or stash them before running release prep");
    }
    if (localTagSha || remoteTagSha) {
      throw new Error(`release tag ${tag} already exists, but package.json is still on ${currentVersion}`);
    }
    needUpdateVersion = true;
    needChecks = true;
    needCommit = true;
  }

  if (options.skipChecks) {
    log("Local checks are skipped");
    needChecks = false;
  } else if (needChecks) {
    log("Local checks are enabled");
  } else {
    log("skip: local checks already passed before this resume point");
  }

  if (needUpdateVersion) {
    await runStep(`Checking npm availability for ${packageName}@${version}`, "npm", [
      "view",
      `${packageName}@${version}`,
      "version",
      "--json"
    ], { expectMissingPackage: true });
    await runStep(`Updating version files to ${version}`, "node", ["scripts/update-version.mjs", version]);
  } else {
    log(`skip: version files are already set to ${version}`);
  }

  if (needChecks) {
    await runStep("Installing dependencies", "pnpm", ["install", "--frozen-lockfile"]);
    await runStep("Running package verification", "pnpm", ["run", "package:check", "--", "--allow-dirty"]);
  }

  if (needCommit) {
    await runStep("Staging version files", "git", ["add", "package.json", "pnpm-lock.yaml", "src/generated/version.ts"]);
    const staged = await git(["diff", "--cached", "--name-only", "--", "package.json", "pnpm-lock.yaml", "src/generated/version.ts"]);
    if (!staged.stdout.trim()) {
      throw new Error(`no staged version changes remain for ${version}; cannot create the release commit`);
    }
    await runStep("Creating release commit", "git", ["commit", "-m", releaseCommitMessage]);
  } else {
    log("skip: release commit already exists");
  }

  const newHeadSha = (await git(["rev-parse", "HEAD"])).stdout.trim();
  if (!localTagSha && remoteTagSha) {
    await runStep(`Fetching existing tag ${tag} from ${remote}`, "git", [
      "fetch",
      remote,
      `refs/tags/${tag}:refs/tags/${tag}`
    ]);
    localTagSha = await refCommit(tag);
  }

  if (localTagSha && !(await tagHasSignature(tag))) {
    throw new Error(`existing tag ${tag} is not signed; delete and recreate it with git tag signing before retrying`);
  }

  if (!localTagSha) {
    log(`Creating signed tag ${tag}; git signing may prompt here`);
    await git(["-c", "tag.gpgSign=true", "tag", "-a", tag, "-m", tag]);
    if (!(await tagHasSignature(tag))) {
      await git(["tag", "-d", tag], { allowFailure: true });
      throw new Error(`created tag ${tag} was not signed; configure git tag signing before retrying`);
    }
    log(`done: Creating signed tag ${tag}`);
  } else {
    log(`skip: local tag ${tag} already exists`);
  }

  remoteMainSha = await remoteRefCommit(remote, "refs/heads/main");
  remoteTagSha = await remoteTagCommit(remote, tag);
  const pushTargets = [];
  if (remoteMainSha !== newHeadSha) pushTargets.push("refs/heads/main:refs/heads/main");
  if (remoteTagSha !== newHeadSha) pushTargets.push(`refs/tags/${tag}:refs/tags/${tag}`);
  if (pushTargets.length > 0) {
    await runStep(`Pushing release refs to ${remote}`, "git", ["push", "--atomic", remote, ...pushTargets]);
  } else {
    log(`skip: main and ${tag} are already pushed to ${remote}`);
  }

  if (options.githubRelease) {
    await createGithubRelease({ packageName, tag, version });
  } else {
    log("skip: GitHub Release creation is disabled");
  }

  console.log(`Release prep complete for ${tag}.

Next:
  1. Watch the Release workflow for ${tag}
  2. Verify npm after the workflow finishes
`);
}

function parseArgs(args) {
  const parsed = { remote: "origin", skipChecks: false, githubRelease: true, help: false, version: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--") {
      continue;
    } else if (arg === "--skip-checks") {
      parsed.skipChecks = true;
    } else if (arg === "--no-github-release") {
      parsed.githubRelease = false;
    } else if (arg === "--remote") {
      index += 1;
      if (!args[index]) throw new Error("--remote requires a value");
      parsed.remote = args[index];
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}`);
    } else if (parsed.version) {
      throw new Error(`version was already provided: ${parsed.version}`);
    } else {
      parsed.version = arg;
    }
  }
  return parsed;
}

async function createGithubRelease({ packageName, tag, version }) {
  const existingRelease = await run("gh", ["release", "view", tag, "--json", "url"], {
    capture: true,
    allowFailure: true
  });
  if (existingRelease.code === 0) {
    const release = JSON.parse(existingRelease.stdout);
    if (await npmPackageVersionExists(packageName, version)) {
      log(`skip: GitHub Release already exists at ${release.url}`);
      log(`skip: ${packageName}@${version} is already published on npm`);
      return;
    }
    log(`GitHub Release already exists at ${release.url}, but ${packageName}@${version} is not on npm`);
    await runStep("Dispatching Release workflow for existing GitHub Release", "gh", [
      "workflow",
      "run",
      "release.yml",
      "--field",
      `tag=${tag}`
    ]);
    return;
  }

  const notesDir = await mkdtemp(join(tmpdir(), "skillcat-release-notes-"));
  const notesFile = join(notesDir, `${tag}.md`);
  try {
    await runStep("Generating GitHub Release notes", "node", [
      "scripts/release-notes.mjs",
      "base",
      "--version",
      version,
      "--output",
      notesFile
    ]);

    const args = [
      "release",
      "create",
      tag,
      "--title",
      `${packageName} ${tag}`,
      "--notes-file",
      notesFile
    ];
    if (version.includes("-")) {
      args.push("--prerelease");
    }
    await runStep("Creating GitHub Release", "gh", args);
  } finally {
    await rm(notesDir, { recursive: true, force: true });
  }
}

async function npmPackageVersionExists(packageName, version) {
  const result = await run("npm", ["view", `${packageName}@${version}`, "version", "--json"], {
    capture: true,
    allowFailure: true
  });
  if (result.code === 0 && result.stdout.trim()) {
    return true;
  }
  if (/E404|404 Not Found|No match found/.test(`${result.stdout}\n${result.stderr}`)) {
    return false;
  }
  throw new Error(`could not verify npm publish state for ${packageName}@${version}`);
}

function isSemverLike(value) {
  const numeric = String.raw`(?:0|[1-9][0-9]*)`;
  const prereleaseIdentifier = String.raw`(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)`;
  return new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?$`).test(value);
}

async function trackedDirtyFiles() {
  const unstaged = await git(["diff", "--name-only", "--ignore-submodules", "--"]);
  const staged = await git(["diff", "--cached", "--name-only", "--ignore-submodules", "--"]);
  return [...new Set(`${unstaged.stdout}\n${staged.stdout}`.split("\n").filter(Boolean))].sort();
}

async function untrackedFiles() {
  const result = await git(["ls-files", "--others", "--exclude-standard"]);
  return result.stdout.split("\n").filter(Boolean).sort();
}

async function dirtyFilesMatchReleaseVersion(files, version) {
  const allowed = new Set(["package.json", "src/generated/version.ts"]);
  if (files.length === 0 || files.some((file) => !allowed.has(file))) {
    return false;
  }

  const packagePath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const headPackage = JSON.parse((await git(["show", "HEAD:package.json"])).stdout);
  headPackage.version = version;
  if (JSON.stringify(packageJson) !== JSON.stringify(headPackage)) {
    return false;
  }

  if (files.includes("src/generated/version.ts")) {
    const expected = `// Generated by scripts/generate-version.ts. Do not edit by hand.\nexport const version = ${JSON.stringify(version)};\n`;
    const actual = await readFile(join(root, "src/generated/version.ts"), "utf8");
    if (actual !== expected) {
      return false;
    }
  }

  return true;
}

async function refCommit(ref) {
  const result = await git(["rev-list", "-n1", ref], { allowFailure: true });
  return result.code === 0 ? result.stdout.trim() : "";
}

async function remoteRefCommit(remote, ref) {
  const result = await git(["ls-remote", remote, ref]);
  return result.stdout.trim().split(/\s+/)[0] ?? "";
}

async function remoteTagCommit(remote, tag) {
  const result = await git(["ls-remote", remote, `refs/tags/${tag}^{}`, `refs/tags/${tag}`]);
  let first = "";
  for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
    const [sha, ref] = line.split(/\s+/);
    if (!first) first = sha;
    if (ref?.endsWith("^{}")) return sha;
  }
  return first;
}

async function isAncestor(ancestor, descendant) {
  const result = await git(["merge-base", "--is-ancestor", ancestor, descendant], { allowFailure: true });
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new Error(`git merge-base --is-ancestor failed with exit code ${result.code}`);
}

async function tagHasSignature(tag) {
  const type = (await git(["cat-file", "-t", tag])).stdout.trim();
  if (type !== "tag") {
    return false;
  }
  const result = await git(["cat-file", "-p", tag]);
  return /-----BEGIN (?:PGP|SSH) SIGNATURE-----/.test(result.stdout);
}

async function runStep(description, command, args, options = {}) {
  const startedAt = Date.now();
  log(description);
  await run(command, args, options);
  log(`done: ${description} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
}

async function git(args, options = {}) {
  return run("git", args, { ...options, capture: true });
}

async function run(command, args, options = {}) {
  const result = await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", (error) => {
      resolve({ code: -1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });

  if (options.expectMissingPackage) {
    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.code === 0) {
      throw new Error("npm package version already exists");
    }
    if (!/E404|404 Not Found|No match found/.test(combined)) {
      throw new Error(`${command} ${args.join(" ")} failed unexpectedly:\n${combined}`);
    }
    return result;
  }

  if (result.code !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.code}`);
  }
  return result;
}

function log(message) {
  console.log(`[release] ${message}`);
}

function printHelp() {
  console.log(`Prepare a skillcat release.

Usage:
  pnpm run release -- <version>

Options:
  --remote <name>     remote to push to, default origin
  --skip-checks       skip local package verification
  --no-github-release push the release commit and tag, but do not create the GitHub Release

Examples:
  pnpm run release -- 0.1.3
`);
}
