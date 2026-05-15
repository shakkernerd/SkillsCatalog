import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readRuntimeEntries } from "./targets.js";
import { loadTargetState, writeTargetState } from "./state.js";

export type UninstallActionType = "remove" | "forget" | "skip" | "conflict";

export interface UninstallAction {
  type: UninstallActionType;
  name: string;
  runtimePath: string;
  exportPath: string;
  reason: string;
}

export interface UninstallPlan {
  targetName: string;
  runtimeDir: string;
  actions: UninstallAction[];
}

export function hasUninstallConflicts(plan: UninstallPlan): boolean {
  return plan.actions.some((action) => action.type === "conflict");
}

export async function planUninstall(
  catalogRoot: string,
  targetName: string,
  runtimeDir: string,
  skillNames: string[]
): Promise<UninstallPlan> {
  const state = await loadTargetState(catalogRoot, targetName, runtimeDir);
  const runtimeEntries = await readRuntimeEntries(runtimeDir);
  const actions: UninstallAction[] = [];

  for (const name of [...skillNames].sort()) {
    const stateEntry = state.entries[name];
    if (!stateEntry) {
      actions.push({
        type: "skip",
        name,
        runtimePath: path.join(runtimeDir, name),
        exportPath: path.join(catalogRoot, "skills", name),
        reason: "not installed by skillcat"
      });
      continue;
    }

    const runtimeEntry = runtimeEntries.get(name);
    if (!runtimeEntry) {
      actions.push({
        type: "forget",
        name,
        runtimePath: stateEntry.runtimePath,
        exportPath: stateEntry.exportPath,
        reason: "runtime link already missing"
      });
      continue;
    }

    if (runtimeEntry.kind !== "symlink") {
      actions.push({
        type: "conflict",
        name,
        runtimePath: stateEntry.runtimePath,
        exportPath: stateEntry.exportPath,
        reason: `runtime path is ${runtimeEntry.kind}`
      });
      continue;
    }

    if (path.resolve(runtimeEntry.path) !== path.resolve(stateEntry.runtimePath)) {
      actions.push({
        type: "conflict",
        name,
        runtimePath: stateEntry.runtimePath,
        exportPath: stateEntry.exportPath,
        reason: `runtime path moved to ${runtimeEntry.path}`
      });
      continue;
    }

    if (path.resolve(runtimeEntry.resolvedTarget ?? "") !== path.resolve(stateEntry.exportPath)) {
      actions.push({
        type: "conflict",
        name,
        runtimePath: stateEntry.runtimePath,
        exportPath: stateEntry.exportPath,
        reason: `symlink points to ${runtimeEntry.resolvedTarget ?? "unknown target"}`
      });
      continue;
    }

    actions.push({
      type: "remove",
      name,
      runtimePath: stateEntry.runtimePath,
      exportPath: stateEntry.exportPath,
      reason: "installed by skillcat"
    });
  }

  return {
    targetName,
    runtimeDir,
    actions
  };
}

export async function applyUninstallPlan(catalogRoot: string, plan: UninstallPlan): Promise<void> {
  if (hasUninstallConflicts(plan)) {
    throw new Error("Cannot apply uninstall plan with conflicts");
  }

  const state = await loadTargetState(catalogRoot, plan.targetName, plan.runtimeDir);
  const removed: Array<{ action: UninstallAction; linkTarget: string }> = [];

  try {
    for (const action of plan.actions) {
      if (action.type === "skip") {
        continue;
      }

      if (action.type === "remove") {
        const linkTarget = await fs.readlink(action.runtimePath);
        const resolvedTarget = path.resolve(path.dirname(action.runtimePath), linkTarget);
        if (path.resolve(resolvedTarget) !== path.resolve(action.exportPath)) {
          throw new Error(`Refusing to remove changed symlink: ${action.runtimePath}`);
        }

        await fs.unlink(action.runtimePath);
        removed.push({ action, linkTarget });
      }

      if (action.type === "remove" || action.type === "forget") {
        delete state.entries[action.name];
      }
    }

    await writeTargetState(catalogRoot, state);
  } catch (error) {
    for (const { action, linkTarget } of removed.reverse()) {
      await fs.symlink(linkTarget, action.runtimePath, "dir");
    }

    throw error;
  }
}
