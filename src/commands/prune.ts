import { resolveCatalogRoot } from "../catalog-root.js";
import { applyPrunePlan, hasPruneConflicts, planPrune, type PrunePlan } from "../core/prune.js";
import { resolveTarget } from "../core/targets.js";
import { SkillcatError } from "../errors.js";
import { loadManifest } from "../manifest.js";

export interface PruneOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  targetName: string;
  dryRun?: boolean;
}

export interface PruneResult {
  plan: PrunePlan;
  applied: boolean;
}

export async function runPrune(options: PruneOptions): Promise<PruneResult> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const target = resolveTarget(manifest, options.targetName, catalogRoot, options.homeDir);
  const plan = await planPrune(catalogRoot, manifest, options.targetName, target.path);

  if (options.dryRun) {
    return { plan, applied: false };
  }

  if (hasPruneConflicts(plan)) {
    throw new SkillcatError("Prune has conflicts; run with --dry-run to inspect");
  }

  await applyPrunePlan(catalogRoot, plan);
  return { plan, applied: true };
}

export function formatPruneResult(result: PruneResult): string {
  const lines = [
    `target: ${result.plan.targetName}`,
    `path: ${result.plan.runtimeDir}`,
    `mode: ${result.applied ? "applied" : "dry-run"}`
  ];

  if (result.plan.actions.length === 0) {
    lines.push("actions: none");
    return `${lines.join("\n")}\n`;
  }

  for (const action of result.plan.actions) {
    lines.push(`${action.type}: ${action.name}: ${action.reason}: ${action.runtimePath} -> ${action.exportPath}`);
  }

  return `${lines.join("\n")}\n`;
}
