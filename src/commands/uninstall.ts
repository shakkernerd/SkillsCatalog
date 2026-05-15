import { resolveCatalogRoot } from "../catalog-root.js";
import { applyUninstallPlan, hasUninstallConflicts, planUninstall, type UninstallPlan } from "../core/uninstall.js";
import { resolveTarget } from "../core/targets.js";
import { SkillcatError } from "../errors.js";
import { loadManifest } from "../manifest.js";

export interface RuntimeUninstallOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  targetName?: string;
  skillNames: string[];
  dryRun?: boolean;
}

export interface RuntimeUninstallResult {
  plan: UninstallPlan;
  applied: boolean;
}

export async function runRuntimeUninstall(options: RuntimeUninstallOptions): Promise<RuntimeUninstallResult> {
  if (!options.targetName) {
    throw new SkillcatError("uninstall requires --target <target>");
  }

  if (options.skillNames.length === 0) {
    throw new SkillcatError("uninstall requires at least one skill");
  }

  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const target = resolveTarget(manifest, options.targetName, catalogRoot, options.homeDir);
  const plan = await planUninstall(catalogRoot, options.targetName, target.path, options.skillNames);

  if (options.dryRun) {
    return { plan, applied: false };
  }

  if (hasUninstallConflicts(plan)) {
    throw new SkillcatError("Uninstall has conflicts; run with --dry-run to inspect");
  }

  await applyUninstallPlan(catalogRoot, plan);
  return { plan, applied: true };
}

export function formatRuntimeUninstallResult(result: RuntimeUninstallResult): string {
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
