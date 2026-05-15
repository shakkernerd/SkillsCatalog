import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { SkillcatError, isNodeError } from "../errors.js";
import type { SkillcatManifest, SkillcatTarget } from "../manifest.js";
import { resolvePath } from "../paths.js";

export interface ResolvedTarget {
  name: string;
  path: string;
  config: SkillcatTarget;
}

export function resolveTarget(
  manifest: SkillcatManifest,
  targetName: string,
  catalogRoot: string,
  homeDir = os.homedir()
): ResolvedTarget {
  const config = manifest.targets[targetName];
  if (!config) {
    throw new SkillcatError(`Unknown target "${targetName}"`);
  }

  return {
    name: targetName,
    path: resolvePath(config.path, catalogRoot, homeDir),
    config
  };
}

export async function readRuntimeEntries(runtimeDir: string): Promise<Map<string, RuntimeEntry>> {
  const entries = new Map<string, RuntimeEntry>();
  let dirEntries;

  try {
    dirEntries = await fs.readdir(runtimeDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return entries;
    }

    throw error;
  }

  for (const entry of dirEntries) {
    const entryPath = path.join(runtimeDir, entry.name);
    const stat = await fs.lstat(entryPath);
    if (stat.isSymbolicLink()) {
      const linkTarget = await fs.readlink(entryPath);
      const resolvedTarget = path.resolve(runtimeDir, linkTarget);
      entries.set(entry.name, {
        name: entry.name,
        path: entryPath,
        kind: "symlink",
        linkTarget,
        resolvedTarget
      });
      continue;
    }

    entries.set(entry.name, {
      name: entry.name,
      path: entryPath,
      kind: stat.isDirectory() ? "directory" : "other"
    });
  }

  return entries;
}

export interface RuntimeEntry {
  name: string;
  path: string;
  kind: "symlink" | "directory" | "other";
  linkTarget?: string;
  resolvedTarget?: string;
}
