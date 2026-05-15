import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SkillcatError, isNodeError } from "../errors.js";
import type { SkillcatExport, SkillcatManifest } from "../manifest.js";

export function exportSourcePath(manifest: SkillcatManifest, entry: SkillcatExport): string {
  const source = manifest.sources[entry.source];
  if (!source) {
    throw new SkillcatError(`Export references unknown source "${entry.source}"`);
  }

  return path.join(source.path, entry.path);
}

export function assertExportNameAllowed(manifest: SkillcatManifest, exportName: string): void {
  for (const [targetName, target] of Object.entries(manifest.targets)) {
    if (target.protected.includes(exportName)) {
      throw new SkillcatError(`Export "${exportName}" conflicts with protected ${targetName} entry`);
    }
  }
}

export async function assertSkillDirectory(skillPath: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(path.join(skillPath, "SKILL.md"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new SkillcatError(`Skill has no SKILL.md: ${skillPath}`);
    }

    throw error;
  }

  if (!stat.isFile()) {
    throw new SkillcatError(`Skill has no SKILL.md: ${skillPath}`);
  }
}
