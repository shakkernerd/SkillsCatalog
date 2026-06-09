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
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.version) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  const version = options.version;
  if (!isSemverLike(version)) {
    throw new Error("version must look like 1.2.3 or 1.2.3-beta.1");
  }

  const packagePath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const currentVersion = packageJson.version;
  if (!currentVersion) {
    throw new Error("could not read package version from package.json");
  }
  if (currentVersion === version) {
    console.log(`skillcat is already on ${version}`);
    return;
  }

  packageJson.version = version;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  await run("pnpm", ["install", "--lockfile-only"]);
  await run("pnpm", ["generate:version"]);
  console.log(`Updated skillcat version: ${currentVersion} -> ${version}`);
}

function parseArgs(args) {
  const parsed = { help: false, version: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--") {
      continue;
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

function isSemverLike(value) {
  const numeric = String.raw`(?:0|[1-9][0-9]*)`;
  const prereleaseIdentifier = String.raw`(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)`;
  return new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?$`).test(value);
}

async function run(command, args) {
  const result = await new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 0));
  });
  if (result !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result}`);
  }
}

function printHelp() {
  console.log(`Update the skillcat package version safely.

Usage:
  node scripts/update-version.mjs <version>

Examples:
  node scripts/update-version.mjs 1.2.3
  node scripts/update-version.mjs 1.0.0-beta.1
`);
}
