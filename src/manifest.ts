import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SkillcatError, isNodeError } from "./errors.js";
import { manifestFileName } from "./catalog-root.js";

export const manifestVersion = 1;

export interface SkillcatManifest {
  version: 1;
  sources: Record<string, SkillcatSource>;
  exports: Record<string, SkillcatExport>;
  targets: Record<string, SkillcatTarget>;
}

export interface SkillcatSource {
  type: "path";
  path: string;
}

export interface SkillcatExport {
  source: string;
  path: string;
}

export interface SkillcatTarget {
  path: string;
  protected: string[];
}

export function createDefaultManifest(): SkillcatManifest {
  return {
    version: manifestVersion,
    sources: {},
    exports: {},
    targets: {
      codex: {
        path: "~/.codex/skills",
        protected: [".system", "codex-primary-runtime"]
      }
    }
  };
}

export async function loadManifest(catalogRoot: string): Promise<SkillcatManifest> {
  const manifestPath = path.join(catalogRoot, manifestFileName);
  let raw: string;

  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new SkillcatError(`No ${manifestFileName} found at ${manifestPath}`);
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SkillcatError(`Invalid ${manifestFileName}: ${message}`);
  }

  return validateManifest(parsed);
}

export async function writeManifest(catalogRoot: string, manifest: SkillcatManifest): Promise<void> {
  const manifestPath = path.join(catalogRoot, manifestFileName);
  const serialized = `${JSON.stringify(validateManifest(manifest), null, 2)}\n`;
  await fs.writeFile(manifestPath, serialized, "utf8");
}

export function validateManifest(value: unknown): SkillcatManifest {
  if (!isRecord(value)) {
    throw new SkillcatError(`${manifestFileName} must be a JSON object`);
  }

  if (value.version !== manifestVersion) {
    throw new SkillcatError(`${manifestFileName} version must be ${manifestVersion}`);
  }

  const sources = validateSources(value.sources);
  const exports = validateExports(value.exports);
  const targets = validateTargets(value.targets);

  for (const [exportName, entry] of Object.entries(exports)) {
    if (!sources[entry.source]) {
      throw new SkillcatError(`Export "${exportName}" references unknown source "${entry.source}"`);
    }
  }

  return {
    version: manifestVersion,
    sources,
    exports,
    targets
  };
}

function validateSources(value: unknown): Record<string, SkillcatSource> {
  if (!isRecord(value)) {
    throw new SkillcatError(`${manifestFileName}.sources must be an object`);
  }

  const sources: Record<string, SkillcatSource> = {};

  for (const [name, source] of Object.entries(value)) {
    validateName(name, "source");
    if (!isRecord(source)) {
      throw new SkillcatError(`Source "${name}" must be an object`);
    }

    if (source.type !== "path") {
      throw new SkillcatError(`Source "${name}" type must be "path"`);
    }

    if (!isNonEmptyString(source.path)) {
      throw new SkillcatError(`Source "${name}" path must be a non-empty string`);
    }

    sources[name] = {
      type: "path",
      path: source.path
    };
  }

  return sources;
}

function validateExports(value: unknown): Record<string, SkillcatExport> {
  if (!isRecord(value)) {
    throw new SkillcatError(`${manifestFileName}.exports must be an object`);
  }

  const exports: Record<string, SkillcatExport> = {};

  for (const [name, entry] of Object.entries(value)) {
    validateName(name, "export");
    if (!isRecord(entry)) {
      throw new SkillcatError(`Export "${name}" must be an object`);
    }

    if (!isNonEmptyString(entry.source)) {
      throw new SkillcatError(`Export "${name}" source must be a non-empty string`);
    }

    if (!isNonEmptyString(entry.path)) {
      throw new SkillcatError(`Export "${name}" path must be a non-empty string`);
    }

    exports[name] = {
      source: entry.source,
      path: entry.path
    };
  }

  return exports;
}

function validateTargets(value: unknown): Record<string, SkillcatTarget> {
  if (!isRecord(value)) {
    throw new SkillcatError(`${manifestFileName}.targets must be an object`);
  }

  const targets: Record<string, SkillcatTarget> = {};

  for (const [name, target] of Object.entries(value)) {
    validateName(name, "target");
    if (!isRecord(target)) {
      throw new SkillcatError(`Target "${name}" must be an object`);
    }

    if (!isNonEmptyString(target.path)) {
      throw new SkillcatError(`Target "${name}" path must be a non-empty string`);
    }

    if (!Array.isArray(target.protected) || !target.protected.every(isNonEmptyString)) {
      throw new SkillcatError(`Target "${name}" protected must be an array of strings`);
    }

    targets[name] = {
      path: target.path,
      protected: [...target.protected]
    };
  }

  return targets;
}

function validateName(name: string, kind: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === "." || name === "..") {
    throw new SkillcatError(`Invalid ${kind} name "${name}"`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
