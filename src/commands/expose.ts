import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveCatalogRoot } from "../catalog-root.js";
import { SkillcatError, isNodeError } from "../errors.js";
import { loadManifest, validateCatalogName, writeManifest } from "../manifest.js";
import { assertExportNameAllowed, assertSkillDirectory } from "../core/exports.js";
import { createDirectorySymlink } from "../core/fs.js";

export interface ExposeOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  sourceName: string;
  skillName: string;
  asName?: string;
}

export interface ExposeResult {
  catalogRoot: string;
  exportName: string;
  sourceName: string;
  sourcePath: string;
  skillPath: string;
  linkStatus: "created" | "exists";
  manifestChanged: boolean;
}

export async function runExpose(options: ExposeOptions): Promise<ExposeResult> {
  validateCatalogName(options.sourceName, "source");
  validateCatalogName(options.skillName, "skill");
  const exportName = options.asName ?? options.skillName;
  validateCatalogName(exportName, "export");

  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const source = manifest.sources[options.sourceName];
  if (!source) {
    throw new SkillcatError(`Unknown source "${options.sourceName}"`);
  }

  assertExportNameAllowed(manifest, exportName);

  const exportPath = path.join("skills", options.skillName);
  const skillPath = path.join(source.path, exportPath);
  await assertSkillDirectory(skillPath);

  const existing = manifest.exports[exportName];
  const linkPath = path.join(catalogRoot, "skills", exportName);
  if (existing) {
    if (existing.source !== options.sourceName || existing.path !== exportPath) {
      throw new SkillcatError(`Export "${exportName}" already points to ${existing.source}:${existing.path}`);
    }

    const linkStatus = await createDirectorySymlink(linkPath, skillPath);
    return {
      catalogRoot,
      exportName,
      sourceName: options.sourceName,
      sourcePath: source.path,
      skillPath,
      linkStatus,
      manifestChanged: false
    };
  }

  const linkStatus = await createDirectorySymlink(linkPath, skillPath);
  manifest.exports[exportName] = {
    source: options.sourceName,
    path: exportPath
  };

  try {
    await writeManifest(catalogRoot, manifest);
  } catch (error) {
    if (linkStatus === "created") {
      await fs.unlink(linkPath);
    }

    throw error;
  }

  return {
    catalogRoot,
    exportName,
    sourceName: options.sourceName,
    sourcePath: source.path,
    skillPath,
    linkStatus,
    manifestChanged: true
  };
}

export async function safeUnlinkExportSymlink(linkPath: string, expectedTarget: string): Promise<"removed" | "missing"> {
  let stat;
  try {
    stat = await fs.lstat(linkPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "missing";
    }

    throw error;
  }

  if (!stat.isSymbolicLink()) {
    throw new SkillcatError(`Refusing to remove non-symlink export: ${linkPath}`);
  }

  const linkTarget = await fs.readlink(linkPath);
  const resolvedTarget = path.resolve(path.dirname(linkPath), linkTarget);
  if (path.resolve(resolvedTarget) !== path.resolve(expectedTarget)) {
    throw new SkillcatError(`Refusing to remove export symlink with unexpected target: ${linkPath}`);
  }

  await fs.unlink(linkPath);
  return "removed";
}

export function formatExposeResult(result: ExposeResult): string {
  const lines = [
    `skill: ${result.exportName}`,
    `source: ${result.sourceName}`,
    `path: ${result.skillPath}`,
    `manifest: ${result.manifestChanged ? "updated" : "exists"}`,
    `link: ${result.linkStatus}`
  ];

  return `${lines.join("\n")}\n`;
}
