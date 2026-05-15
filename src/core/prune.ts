import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SkillcatManifest } from "../manifest.js";
import { readRuntimeEntries } from "./targets.js";
import { loadTargetState, writeTargetState, type TargetStateEntry } from "./state.js";

export type PruneActionType = "remove" | "forget" | "skip" | "conflict";

export interface PruneAction {
  type: PruneActionType;
  name: string;
  runtimePath: string;
  exportPath: string;
  reason: string;
}

export interface PrunePlan {
  targetName: string;
  runtimeDir: string;
  actions: PruneAction[];
}

export function hasPruneConflicts(plan: PrunePlan): boolean {
  return plan.actions.some((action) => action.type === "conflict");
}

export async function planPrune(
  catalogRoot: string,
  manifest: SkillcatManifest,
  targetName: string,
  runtimeDir: string
): Promise<PrunePlan> {
  const state = await loadTargetState(catalogRoot, targetName, runtimeDir);
  if (state.runtimeDir && path.resolve(state.runtimeDir) !== path.resolve(runtimeDir)) {
    return {
      targetName,
      runtimeDir,
      actions: [
        {
          type: "conflict",
          name: "(state)",
          runtimePath: state.runtimeDir,
          exportPath: runtimeDir,
          reason: "state runtimeDir differs from target runtimeDir"
        }
      ]
    };
  }

  const runtimeEntries = await readRuntimeEntries(runtimeDir);
  const actions: PruneAction[] = [];

  for (const [name, entry] of Object.entries(state.entries).sort(([left], [right]) => left.localeCompare(right))) {
    if (manifest.exports[name]) {
      actions.push({
        type: "skip",
        name,
        runtimePath: entry.runtimePath,
        exportPath: entry.exportPath,
        reason: "still exported"
      });
      continue;
    }

    const runtimeEntry = runtimeEntries.get(name);
    if (!runtimeEntry) {
      actions.push({
        type: "forget",
        name,
        runtimePath: entry.runtimePath,
        exportPath: entry.exportPath,
        reason: "runtime link already missing"
      });
      continue;
    }

    if (runtimeEntry.kind !== "symlink") {
      actions.push({
        type: "conflict",
        name,
        runtimePath: entry.runtimePath,
        exportPath: entry.exportPath,
        reason: `runtime path is ${runtimeEntry.kind}`
      });
      continue;
    }

    if (path.resolve(runtimeEntry.path) !== path.resolve(entry.runtimePath)) {
      actions.push({
        type: "conflict",
        name,
        runtimePath: entry.runtimePath,
        exportPath: entry.exportPath,
        reason: `runtime path moved to ${runtimeEntry.path}`
      });
      continue;
    }

    if (path.resolve(runtimeEntry.resolvedTarget ?? "") !== path.resolve(entry.exportPath)) {
      actions.push({
        type: "conflict",
        name,
        runtimePath: entry.runtimePath,
        exportPath: entry.exportPath,
        reason: `symlink points to ${runtimeEntry.resolvedTarget ?? "unknown target"}`
      });
      continue;
    }

    actions.push({
      type: "remove",
      name,
      runtimePath: entry.runtimePath,
      exportPath: entry.exportPath,
      reason: "no longer exported"
    });
  }

  return {
    targetName,
    runtimeDir,
    actions
  };
}

export async function applyPrunePlan(catalogRoot: string, plan: PrunePlan): Promise<void> {
  if (hasPruneConflicts(plan)) {
    throw new Error("Cannot apply prune plan with conflicts");
  }

  const state = await loadTargetState(catalogRoot, plan.targetName, plan.runtimeDir);
  const removed: Array<{ action: PruneAction; linkTarget: string }> = [];
  const previousEntries = new Map<string, TargetStateEntry>();

  try {
    for (const action of plan.actions) {
      if (action.type === "skip") {
        continue;
      }

      const existing = state.entries[action.name];
      if (existing) {
        previousEntries.set(action.name, existing);
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

    state.runtimeDir = plan.runtimeDir;
    await writeTargetState(catalogRoot, state);
  } catch (error) {
    for (const { action, linkTarget } of removed.reverse()) {
      await fs.symlink(linkTarget, action.runtimePath, "dir");
    }

    for (const [name, entry] of previousEntries.entries()) {
      state.entries[name] = entry;
    }

    throw error;
  }
}
