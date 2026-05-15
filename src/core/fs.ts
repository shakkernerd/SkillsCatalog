import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SkillcatError, isNodeError } from "../errors.js";

export async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function assertDirectory(target: string, label: string): Promise<void> {
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

export async function createDirectorySymlink(linkPath: string, targetPath: string): Promise<"created" | "exists"> {
  const linkDir = path.dirname(linkPath);
  await ensureDirectory(linkDir);

  let stat;
  try {
    stat = await fs.lstat(linkPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      const relativeTarget = path.relative(linkDir, targetPath) || ".";
      await fs.symlink(relativeTarget, linkPath, "dir");
      return "created";
    }

    throw error;
  }

  if (!stat.isSymbolicLink()) {
    throw new SkillcatError(`Refusing to replace existing path: ${linkPath}`);
  }

  const existingTarget = await fs.readlink(linkPath);
  const resolvedExistingTarget = path.resolve(linkDir, existingTarget);
  if (path.resolve(resolvedExistingTarget) !== path.resolve(targetPath)) {
    throw new SkillcatError(`Refusing to replace existing symlink: ${linkPath}`);
  }

  return "exists";
}
