import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SkillcatError, isNodeError } from "../errors.js";
import type { SkillcatManifest } from "../manifest.js";
import { exportSourcePath, assertExportNameAllowed } from "./exports.js";
import { listSourceSkills } from "./skills.js";
import { readSkillFrontmatter } from "./frontmatter.js";

export interface ValidationIssue {
  level: "error";
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
}

export async function validateCatalog(catalogRoot: string, manifest: SkillcatManifest): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  for (const [name, source] of Object.entries(manifest.sources)) {
    await collectIssue(issues, async () => {
      await assertDirectory(source.path, `Source "${name}"`);
      const skills = await listSourceSkills(source.path);
      if (skills.length === 0) {
        throw new SkillcatError(`Source "${name}" has no supported SKILL.md entries`);
      }

      await assertSymlink(path.join(catalogRoot, "sources", name), source.path, `Source "${name}" link`);
    });
  }

  for (const [name, entry] of Object.entries(manifest.exports)) {
    await collectIssue(issues, async () => {
      assertExportNameAllowed(manifest, name);
      const skillPath = exportSourcePath(manifest, entry);
      await assertDirectory(skillPath, `Export "${name}" skill`);
      await assertFile(path.join(skillPath, "SKILL.md"), `Export "${name}" SKILL.md`);
      await readSkillFrontmatter(path.join(skillPath, "SKILL.md"));
      await assertSymlink(path.join(catalogRoot, "skills", name), skillPath, `Export "${name}" link`);
    });
  }

  return { issues };
}

async function collectIssue(issues: ValidationIssue[], fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SkillcatError) {
      issues.push({ level: "error", message: error.message });
      return;
    }

    if (error instanceof Error) {
      issues.push({ level: "error", message: error.message });
      return;
    }

    issues.push({ level: "error", message: String(error) });
  }
}

async function assertDirectory(target: string, label: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(target);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new SkillcatError(`${label} does not exist: ${target}`);
    }

    throw error;
  }

  if (!stat.isDirectory()) {
    throw new SkillcatError(`${label} is not a directory: ${target}`);
  }
}

async function assertFile(target: string, label: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(target);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new SkillcatError(`${label} does not exist: ${target}`);
    }

    throw error;
  }

  if (!stat.isFile()) {
    throw new SkillcatError(`${label} is not a file: ${target}`);
  }
}

async function assertSymlink(linkPath: string, expectedTarget: string, label: string): Promise<void> {
  let stat;
  try {
    stat = await fs.lstat(linkPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new SkillcatError(`${label} does not exist: ${linkPath}`);
    }

    throw error;
  }

  if (!stat.isSymbolicLink()) {
    throw new SkillcatError(`${label} is not a symlink: ${linkPath}`);
  }

  const linkTarget = await fs.readlink(linkPath);
  const resolvedTarget = path.resolve(path.dirname(linkPath), linkTarget);
  if (path.resolve(resolvedTarget) !== path.resolve(expectedTarget)) {
    throw new SkillcatError(`${label} points to ${resolvedTarget}, expected ${expectedTarget}`);
  }
}
