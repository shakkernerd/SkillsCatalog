#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
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
  if (options.help || !options.command) {
    printHelp();
    process.exitCode = options.help ? 0 : 1;
    return;
  }

  if (!options.version) {
    throw new Error("--version is required");
  }
  if (!options.output) {
    throw new Error("--output is required");
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const packageName = packageJson.name;
  if (!packageName) {
    throw new Error("package.json must include name");
  }
  const repositoryUrl = normalizeRepositoryUrl(packageJson.repository);

  if (options.command === "base") {
    await writeFile(options.output, await baseReleaseNotes({ packageName, repositoryUrl, version: options.version }), "utf8");
    return;
  }

  if (options.command === "append-publish-proof") {
    await writeFile(options.output, await releaseNotesWithPublishProof({ packageName, repositoryUrl, version: options.version }), "utf8");
    return;
  }

  throw new Error(`unknown command: ${options.command}`);
}

async function baseReleaseNotes({ packageName, repositoryUrl, version }) {
  const tag = `v${version}`;
  const previousTag = await previousVersionTag(tag);
  const changes = await releaseChanges(previousTag, tag, version);
  const compareUrl = previousTag && repositoryUrl ? `${repositoryUrl}/compare/${previousTag}...${tag}` : "";

  return [
    `## ${packageName} ${tag}`,
    "",
    `This release publishes ${packageName} ${tag}.`,
    "",
    "### Changes",
    "",
    ...changes.map((change) => `- ${change}`),
    ...(compareUrl ? ["", "### Changelog", "", compareUrl] : []),
    "",
    "### Verification",
    "",
    "- Release workflow: pending.",
    "- npm publish: pending.",
    ""
  ].join("\n");
}

async function releaseNotesWithPublishProof({ packageName, repositoryUrl, version }) {
  const body = options.bodyFile ? await readFile(options.bodyFile, "utf8") : "";
  const baseBody = stripPublishProof(body.trimEnd()).trimEnd() || stripPublishProof(
    await baseReleaseNotes({ packageName, repositoryUrl, version })
  ).trimEnd();
  const published = await npmView(packageName, version);
  const tag = `v${version}`;
  const workflowUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "";
  const compareUrl = await compareUrlFor(tag, repositoryUrl) || existingChangelogUrl(body);
  const ciLines = [
    ...(workflowUrl ? [`- Release workflow: ${workflowUrl}`] : []),
    ...(compareUrl && !baseBody.includes(compareUrl) ? [`- Changelog: ${compareUrl}`] : [])
  ];

  return [
    baseBody,
    "",
    "### Verification",
    "",
    "- Release workflow passed: build, tests, pack, installed tarball smoke, npm publish, release asset upload.",
    "- Fresh npm smoke is covered by the installed tarball smoke in the release workflow.",
    "",
    "### npm",
    "",
    `- Version page: https://www.npmjs.com/package/${packageName}/v/${version}`,
    `- Tarball: ${published.tarball}`,
    `- Integrity: \`${published.integrity}\``,
    `- Shasum: \`${published.shasum}\``,
    ...(ciLines.length ? ["", "### CI", "", ...ciLines] : []),
    ""
  ].join("\n");
}

function stripPublishProof(body) {
  return body.replace(/\n### Verification\n[\s\S]*$/u, "");
}

function existingChangelogUrl(body) {
  return body.match(/https:\/\/github\.com\/[^\s)]+\/compare\/[^\s)]+/u)?.[0] || "";
}

async function releaseChanges(previousTag, tag, version) {
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const result = await git(["log", "--pretty=%s", range]);
  const ignored = new Set([`chore: bump version to ${version}`]);
  const changes = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !ignored.has(line))
    .filter((line) => !/^Merge /u.test(line));

  if (changes.length === 0) {
    return ["Internal release maintenance."];
  }
  return changes;
}

async function previousVersionTag(currentTag) {
  const result = await git(["tag", "--merged", "HEAD", "--sort=-v:refname", "--list", "v[0-9]*.[0-9]*.[0-9]*"]);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((tag) => tag !== currentTag) || "";
}

async function compareUrlFor(tag, repositoryUrl) {
  const previousTag = await previousVersionTag(tag);
  if (!previousTag || !repositoryUrl) return "";
  return `${repositoryUrl}/compare/${previousTag}...${tag}`;
}

function normalizeRepositoryUrl(repository) {
  const value = typeof repository === "string" ? repository : repository?.url;
  if (!value) return "";
  return value
    .replace(/^git\+/u, "")
    .replace(/^git@github\.com:/u, "https://github.com/")
    .replace(/\.git$/u, "");
}

async function npmView(packageName, version) {
  const result = await run("npm", ["view", `${packageName}@${version}`, "dist.tarball", "dist.integrity", "dist.shasum", "--json"], {
    capture: true
  });
  const parsed = JSON.parse(result.stdout);
  if (!parsed["dist.tarball"] || !parsed["dist.integrity"] || !parsed["dist.shasum"]) {
    throw new Error(`npm view did not return complete dist metadata for ${packageName}@${version}`);
  }
  return {
    tarball: parsed["dist.tarball"],
    integrity: parsed["dist.integrity"],
    shasum: parsed["dist.shasum"]
  };
}

async function git(args) {
  return run("git", args, { capture: true });
}

async function run(command, commandArgs, options = {}) {
  const result = await new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
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

  if (result.code !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${result.code}\n${result.stderr || result.stdout}`);
  }
  return result;
}

function parseArgs(args) {
  const parsed = { command: "", version: "", output: "", bodyFile: "", help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (!parsed.command) {
      parsed.command = arg;
    } else if (arg === "--version") {
      index += 1;
      if (!args[index]) throw new Error("--version requires a value");
      parsed.version = args[index];
    } else if (arg === "--output") {
      index += 1;
      if (!args[index]) throw new Error("--output requires a value");
      parsed.output = args[index];
    } else if (arg === "--body-file") {
      index += 1;
      if (!args[index]) throw new Error("--body-file requires a value");
      parsed.bodyFile = args[index];
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Generate skillcat release notes.

Usage:
  node scripts/release-notes.mjs base --version <version> --output <file>
  node scripts/release-notes.mjs append-publish-proof --version <version> --body-file <file> --output <file>
`);
}
