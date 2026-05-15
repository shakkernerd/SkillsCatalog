import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveCatalogRoot } from "../catalog-root.js";
import { SkillcatError } from "../errors.js";
import { loadManifest, validateCatalogName, writeManifest } from "../manifest.js";
import { exportSourcePath } from "../core/exports.js";
import { safeUnlinkExportSymlink } from "./expose.js";

export interface UnexposeOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  exportName: string;
}

export interface UnexposeResult {
  exportName: string;
  linkStatus: "removed" | "missing";
}

export async function runUnexpose(options: UnexposeOptions): Promise<UnexposeResult> {
  validateCatalogName(options.exportName, "export");
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const existing = manifest.exports[options.exportName];
  if (!existing) {
    throw new SkillcatError(`Unknown export "${options.exportName}"`);
  }

  const linkPath = path.join(catalogRoot, "skills", options.exportName);
  const expectedTarget = exportSourcePath(manifest, existing);
  const linkStatus = await safeUnlinkExportSymlink(linkPath, expectedTarget);
  delete manifest.exports[options.exportName];

  try {
    await writeManifest(catalogRoot, manifest);
  } catch (error) {
    if (linkStatus === "removed") {
      const relativeTarget = path.relative(path.dirname(linkPath), expectedTarget) || ".";
      await fs.symlink(relativeTarget, linkPath, "dir");
    }

    throw error;
  }

  return {
    exportName: options.exportName,
    linkStatus
  };
}

export function formatUnexposeResult(result: UnexposeResult): string {
  return `skill: ${result.exportName}\nlink: ${result.linkStatus}\nmanifest: updated\n`;
}
