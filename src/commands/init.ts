import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveCatalogRoot } from "../catalog-root.js";
import { SkillcatError, isNodeError } from "../errors.js";
import { createDefaultManifest, loadManifest, writeManifest } from "../manifest.js";
import { displayPath } from "../paths.js";

export interface InitOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  here?: boolean;
  force?: boolean;
}

export interface InitResult {
  catalogRoot: string;
  createdManifest: boolean;
  createdDirectories: string[];
}

const catalogDirectories = ["skills", "sources", "state/targets", "cache"];

export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    here: options.here,
    explicitHome: options.catalogHome
  });

  await fs.mkdir(catalogRoot, { recursive: true });

  let createdManifest = false;
  try {
    await loadManifest(catalogRoot);
  } catch (error) {
    if (error instanceof SkillcatError && error.message.startsWith("No skillcat.json found")) {
      await writeManifest(catalogRoot, createDefaultManifest());
      createdManifest = true;
    } else {
      throw error;
    }
  }

  const createdDirectories: string[] = [];
  for (const relativeDir of catalogDirectories) {
    const dir = path.join(catalogRoot, relativeDir);
    const existed = await directoryExists(dir);
    await fs.mkdir(dir, { recursive: true });
    if (!existed) {
      createdDirectories.push(relativeDir);
    }
  }

  if (!createdManifest && !options.force && createdDirectories.length === 0) {
    return { catalogRoot, createdManifest, createdDirectories };
  }

  return { catalogRoot, createdManifest, createdDirectories };
}

export function formatInitResult(result: InitResult, homeDir: string): string {
  const lines = [`catalog: ${displayPath(result.catalogRoot, homeDir)}`];
  lines.push(`manifest: ${result.createdManifest ? "created" : "exists"}`);

  if (result.createdDirectories.length > 0) {
    for (const dir of result.createdDirectories) {
      lines.push(`created: ${dir}`);
    }
  } else {
    lines.push("directories: ready");
  }

  return `${lines.join("\n")}\n`;
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
