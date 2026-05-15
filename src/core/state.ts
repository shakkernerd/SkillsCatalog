import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isNodeError } from "../errors.js";

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
    const parsed = JSON.parse(raw) as TargetState;
    if (parsed.target !== targetName || typeof parsed.entries !== "object" || parsed.entries === null) {
      return emptyTargetState(targetName, runtimeDir);
    }

    return parsed;
  } catch {
    return emptyTargetState(targetName, runtimeDir);
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
