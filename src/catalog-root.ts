import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { isNodeError } from "./errors.js";
import { resolvePath } from "./paths.js";

export const manifestFileName = "skillcat.json";

export interface ResolveCatalogRootOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  here?: boolean;
  explicitHome?: string;
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

export async function findNearestCatalogRoot(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);

  while (true) {
    if (await pathExists(path.join(current, manifestFileName))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export async function resolveCatalogRoot(options: ResolveCatalogRootOptions = {}): Promise<string> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const homeDir = options.home ?? os.homedir();

  if (options.explicitHome) {
    return resolvePath(options.explicitHome, cwd, homeDir);
  }

  if (options.here) {
    return cwd;
  }

  const nearest = await findNearestCatalogRoot(cwd);
  if (nearest) {
    return nearest;
  }

  if (env.SKILLCAT_HOME) {
    return resolvePath(env.SKILLCAT_HOME, cwd, homeDir);
  }

  return path.join(homeDir, ".skillcat");
}
