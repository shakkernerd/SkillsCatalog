import { resolveCatalogRoot } from "../catalog-root.js";
import { applyUninstallPlan, hasUninstallConflicts, planUninstall, type UninstallPlan } from "../core/uninstall.js";
import { resolveTarget } from "../core/targets.js";
import { SkillcatError } from "../errors.js";
import { loadManifest } from "../manifest.js";
import { runUnexpose } from "./unexpose.js";

export interface RemoveOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  skillName: string;
  dryRun?: boolean;
}

export interface RemoveResult {
  skillName: string;
  plans: UninstallPlan[];
  applied: boolean;
}

export async function runRemove(options: RemoveOptions): Promise<RemoveResult> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  if (!manifest.exports[options.skillName]) {
    throw new SkillcatError(`Unknown catalog skill "${options.skillName}"`);
  }

  const plans: UninstallPlan[] = [];
  for (const targetName of Object.keys(manifest.targets).sort()) {
    const target = resolveTarget(manifest, targetName, catalogRoot, options.homeDir);
    plans.push(await planUninstall(catalogRoot, targetName, target.path, [options.skillName]));
  }

  if (options.dryRun) {
    return { skillName: options.skillName, plans, applied: false };
  }

  if (plans.some(hasUninstallConflicts)) {
    throw new SkillcatError("Remove has runtime conflicts; run with --dry-run to inspect");
  }

  for (const plan of plans) {
    await applyUninstallPlan(catalogRoot, plan);
  }

  await runUnexpose({
    cwd: options.cwd,
    env: options.env,
    homeDir: options.homeDir,
    catalogHome: options.catalogHome,
    exportName: options.skillName
  });

  return { skillName: options.skillName, plans, applied: true };
}

export function formatRemoveResult(result: RemoveResult): string {
  const lines = [`skill: ${result.skillName}`, `mode: ${result.applied ? "applied" : "dry-run"}`];

  for (const plan of result.plans) {
    lines.push(`target: ${plan.targetName}`);
    if (plan.actions.length === 0) {
      lines.push("actions: none");
      continue;
    }

    for (const action of plan.actions) {
      lines.push(`${action.type}: ${action.name}: ${action.reason}: ${action.runtimePath} -> ${action.exportPath}`);
    }
  }

  lines.push(`catalog: ${result.applied ? "removed" : "would remove"}`);
  return `${lines.join("\n")}\n`;
}
