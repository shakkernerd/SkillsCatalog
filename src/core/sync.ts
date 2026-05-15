import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SkillcatManifest } from "../manifest.js";
import { createDirectorySymlink } from "./fs.js";
import { readRuntimeEntries } from "./targets.js";
import { loadTargetState, writeTargetState, type TargetState } from "./state.js";

export type SyncActionType = "create" | "skip" | "conflict";

export interface SyncAction {
  type: SyncActionType;
  name: string;
  runtimePath: string;
  exportPath: string;
  reason: string;
}

export interface SyncPlan {
  targetName: string;
  runtimeDir: string;
  actions: SyncAction[];
}

export function hasSyncConflicts(plan: SyncPlan): boolean {
  return plan.actions.some((action) => action.type === "conflict");
}

export async function planSync(
  catalogRoot: string,
  manifest: SkillcatManifest,
  targetName: string,
  runtimeDir: string
): Promise<SyncPlan> {
  const target = manifest.targets[targetName];
  const runtimeEntries = await readRuntimeEntries(runtimeDir);
  const actions: SyncAction[] = [];

  for (const exportName of Object.keys(manifest.exports).sort()) {
    const runtimePath = path.join(runtimeDir, exportName);
    const exportPath = path.join(catalogRoot, "skills", exportName);

    if (target.protected.includes(exportName)) {
      actions.push({
        type: "conflict",
        name: exportName,
        runtimePath,
        exportPath,
        reason: "protected target name"
      });
      continue;
    }

    const entry = runtimeEntries.get(exportName);
    if (!entry) {
      actions.push({
        type: "create",
        name: exportName,
        runtimePath,
        exportPath,
        reason: "missing runtime link"
      });
      continue;
    }

    if (entry.kind !== "symlink") {
      actions.push({
        type: "conflict",
        name: exportName,
        runtimePath,
        exportPath,
        reason: `existing ${entry.kind}`
      });
      continue;
    }

    if (path.resolve(entry.resolvedTarget ?? "") !== path.resolve(exportPath)) {
      actions.push({
        type: "conflict",
        name: exportName,
        runtimePath,
        exportPath,
        reason: `symlink points to ${entry.resolvedTarget ?? "unknown target"}`
      });
      continue;
    }

    actions.push({
      type: "skip",
      name: exportName,
      runtimePath,
      exportPath,
      reason: "already linked"
    });
  }

  return {
    targetName,
    runtimeDir,
    actions
  };
}

export async function applySyncPlan(catalogRoot: string, plan: SyncPlan): Promise<TargetState> {
  if (hasSyncConflicts(plan)) {
    throw new Error("Cannot apply sync plan with conflicts");
  }

  await fs.mkdir(plan.runtimeDir, { recursive: true });
  const state = await loadTargetState(catalogRoot, plan.targetName, plan.runtimeDir);
  state.runtimeDir = plan.runtimeDir;

  const created: SyncAction[] = [];
  try {
    for (const action of plan.actions) {
      if (action.type !== "create") {
        continue;
      }

      const linkStatus = await createDirectorySymlink(action.runtimePath, action.exportPath);
      if (linkStatus === "created") {
        created.push(action);
        state.entries[action.name] = {
          runtimePath: action.runtimePath,
          exportPath: action.exportPath,
          mode: "symlink",
          createdBy: "skillcat"
        };
      }
    }

    await writeTargetState(catalogRoot, state);
    return state;
  } catch (error) {
    for (const action of created.reverse()) {
      await fs.rm(action.runtimePath, { force: true });
      delete state.entries[action.name];
    }

    throw error;
  }
}
