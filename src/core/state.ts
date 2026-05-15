import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SkillcatError, isNodeError } from "../errors.js";

export interface TargetState {
  target: string;
  runtimeDir: string;
  entries: Record<string, TargetStateEntry>;
}

export interface TargetStateEntry {
  runtimePath: string;
  exportPath: string;
  mode: "symlink";
  createdBy: "skillcat";
}

export function emptyTargetState(target: string, runtimeDir: string): TargetState {
  return {
    target,
    runtimeDir,
    entries: {}
  };
}

export async function loadTargetState(catalogRoot: string, targetName: string, runtimeDir: string): Promise<TargetState> {
  const statePath = targetStatePath(catalogRoot, targetName);
  let raw: string;

  try {
    raw = await fs.readFile(statePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return emptyTargetState(targetName, runtimeDir);
    }

    throw error;
  }

  try {
    return validateTargetState(JSON.parse(raw), targetName);
  } catch (error) {
    if (error instanceof SkillcatError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new SkillcatError(`Invalid target state for "${targetName}": ${message}`);
  }
}

export async function writeTargetState(catalogRoot: string, state: TargetState): Promise<void> {
  const statePath = targetStatePath(catalogRoot, state.target);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, statePath);
}

export function targetStatePath(catalogRoot: string, targetName: string): string {
  return path.join(catalogRoot, "state", "targets", `${targetName}.json`);
}

function validateTargetState(value: unknown, targetName: string): TargetState {
  if (!isRecord(value)) {
    throw new SkillcatError(`Target state for "${targetName}" must be an object`);
  }

  if (value.target !== targetName) {
    throw new SkillcatError(`Target state for "${targetName}" has mismatched target`);
  }

  if (typeof value.runtimeDir !== "string") {
    throw new SkillcatError(`Target state for "${targetName}" runtimeDir must be a string`);
  }

  if (!isRecord(value.entries)) {
    throw new SkillcatError(`Target state for "${targetName}" entries must be an object`);
  }

  const entries: Record<string, TargetStateEntry> = {};
  for (const [name, entry] of Object.entries(value.entries)) {
    if (!isRecord(entry)) {
      throw new SkillcatError(`Target state entry "${name}" must be an object`);
    }

    if (
      typeof entry.runtimePath !== "string" ||
      typeof entry.exportPath !== "string" ||
      entry.mode !== "symlink" ||
      entry.createdBy !== "skillcat"
    ) {
      throw new SkillcatError(`Target state entry "${name}" is invalid`);
    }

    entries[name] = {
      runtimePath: entry.runtimePath,
      exportPath: entry.exportPath,
      mode: "symlink",
      createdBy: "skillcat"
    };
  }

  return {
    target: targetName,
    runtimeDir: value.runtimeDir,
    entries
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
