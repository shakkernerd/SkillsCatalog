#!/usr/bin/env node
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Set(process.argv.slice(2));
const allowDirty = args.has("--allow-dirty");
const skipVersionCheck = args.has("--skip-version-check");

const requiredPackFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/cli.js"
];

const forbiddenPackPrefixes = [
  ".artifacts/",
  ".github/",
  "src/",
  "test/",
  "scripts/",
  "node_modules/",
  "PLAN.md"
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return;
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const packageName = packageJson.name;
  const version = packageJson.version;
  if (!packageName || !version) {
    throw new Error("package.json must include name and version");
  }

  log(`package check for ${packageName}@${version}`);
  await ensureCleanGitTree("before package check");
  if (skipVersionCheck) {
    log("npm version availability check skipped because --skip-version-check was provided");
  } else {
    await ensureVersionNotPublished(packageName, version);
  }
  await run("pnpm", ["run", "check"]);
  await ensureCleanGitTree("after pnpm check");

  const packDir = await mkdtemp(join(tmpdir(), "skillcat-release-"));
  try {
    const pack = await npmPack(packDir);
    await ensureCleanGitTree("after npm pack");
    inspectPack(pack);
    await smokeInstalledPackage(pack.filename, version);

    log("package check passed");
  } finally {
    await rm(packDir, { recursive: true, force: true });
  }
}

async function ensureCleanGitTree(phase) {
  if (allowDirty) {
    log("git cleanliness skipped because --allow-dirty was provided");
    return;
  }
  const status = await run("git", ["status", "--short"], { capture: true });
  if (status.stdout.trim()) {
    throw new Error(`package check requires a clean git tree ${phase}:\n${status.stdout}`);
  }
}

async function ensureVersionNotPublished(packageName, version) {
  const result = await run("npm", ["view", `${packageName}@${version}`, "version", "--json"], {
    capture: true,
    allowFailure: true
  });
  if (result.code === 0 && result.stdout.trim()) {
    throw new Error(`${packageName}@${version} is already published on npm`);
  }
  if (result.code !== 0 && !/E404|404 Not Found|No match found/.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(`could not verify npm version availability:\n${result.stderr || result.stdout}`);
  }
  log(`${packageName}@${version} is available on npm`);
}

async function npmPack(packDir) {
  const result = await run("npm", ["pack", "--json", "--pack-destination", packDir], { capture: true });
  const parsed = parseNpmPackJson(result.stdout);
  const pack = parsed[0];
  if (!pack?.filename || !Array.isArray(pack.files)) {
    throw new Error("npm pack did not return the expected JSON shape");
  }
  log(`packed ${pack.filename} (${pack.entryCount} files, ${pack.size} bytes)`);
  return {
    ...pack,
    filename: join(packDir, pack.filename)
  };
}

function parseNpmPackJson(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack did not print JSON output:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

function inspectPack(pack) {
  const files = pack.files.map((file) => file.path);
  const missing = requiredPackFiles.filter((file) => !files.includes(file));
  if (missing.length) {
    throw new Error(`packed tarball is missing required files: ${missing.join(", ")}`);
  }

  const forbidden = files.filter((file) => forbiddenPackPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)));
  if (forbidden.length) {
    throw new Error(`packed tarball includes forbidden files: ${forbidden.join(", ")}`);
  }

  log("packed tarball file list is clean");
}

async function smokeInstalledPackage(tarball, expectedVersion) {
  const smokeDir = await mkdtemp(join(tmpdir(), "skillcat-smoke-"));
  const catalogHome = join(smokeDir, "catalog");
  const sourceRoot = join(smokeDir, "maintainers");
  try {
    await run("npm", ["init", "-y"], { cwd: smokeDir, quiet: true });
    await run("npm", ["install", tarball], { cwd: smokeDir, quiet: true });

    const bin = join(smokeDir, "node_modules", ".bin", "skillcat");
    const version = await run(bin, ["--version"], { cwd: smokeDir, capture: true });
    if (version.stdout.trim() !== expectedVersion) {
      throw new Error(`installed CLI version mismatch: expected ${expectedVersion}, got ${version.stdout.trim()}`);
    }

    await createSmokeSkillSource(sourceRoot);
    await run(bin, ["--home", catalogHome, "init"], { cwd: smokeDir, quiet: true });
    await run(bin, ["--home", catalogHome, "source", "add", sourceRoot, "--name", "maintainers"], { cwd: smokeDir, quiet: true });
    await run(bin, ["--home", catalogHome, "add", "maintainers/prepare-pr"], { cwd: smokeDir, quiet: true });
    await run(bin, ["--home", catalogHome, "validate"], { cwd: smokeDir, quiet: true });

    const list = await run(bin, ["--home", catalogHome, "list"], { cwd: smokeDir, capture: true });
    if (!list.stdout.includes("prepare-pr: maintainers:.agents/skills/prepare-pr")) {
      throw new Error(`installed CLI smoke did not list discovered .agents skill:\n${list.stdout}`);
    }

    log("installed tarball smoke passed");
  } finally {
    await rm(smokeDir, { recursive: true, force: true });
  }
}

async function createSmokeSkillSource(sourceRoot) {
  const skillDir = join(sourceRoot, ".agents", "skills", "prepare-pr");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: prepare-pr\ndescription: "Prepare pull requests"\n---\n\n# Prepare PR\n`,
    "utf8"
  );
}

async function run(command, commandArgs, options = {}) {
  const result = await new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? root,
      stdio: options.capture || options.quiet ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (!options.capture && !options.quiet) {
          process.stdout.write(chunk);
        }
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (!options.capture && !options.quiet) {
          process.stderr.write(chunk);
        }
      });
    }
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });

  if (result.code !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${result.code}\n${result.stderr || result.stdout}`);
  }
  return result;
}

function log(message) {
  console.log(`[package-check] ${message}`);
}

function printHelp() {
  console.log(`Usage:
  pnpm run package:check

Options:
  --allow-dirty             allow a dirty git tree, useful while testing this script
  --skip-version-check      skip npm version availability check, useful for CI after release
`);
}
