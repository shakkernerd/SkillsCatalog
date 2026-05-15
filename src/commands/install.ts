import { SkillcatError } from "../errors.js";
import { resolveCatalogRoot } from "../catalog-root.js";
import { loadManifest } from "../manifest.js";
import { resolveTarget } from "../core/targets.js";
import { applySyncPlan, hasSyncConflicts, planSync, type SyncPlan } from "../core/sync.js";

export interface InstallOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  targetName?: string;
  skillNames: string[];
  dryRun?: boolean;
}

export interface InstallResult {
  plan: SyncPlan;
  applied: boolean;
}

export async function runInstall(options: InstallOptions): Promise<InstallResult> {
  if (!options.targetName) {
    throw new SkillcatError("install requires --target <target>");
  }

  if (options.skillNames.length === 0) {
    throw new SkillcatError("install requires at least one skill");
  }

  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const target = resolveTarget(manifest, options.targetName, catalogRoot, options.homeDir);
  const plan = await planSync(catalogRoot, manifest, options.targetName, target.path, options.skillNames);

  if (options.dryRun) {
    return { plan, applied: false };
  }

  if (hasSyncConflicts(plan)) {
    throw new SkillcatError("Install has conflicts; run with --dry-run to inspect");
  }

  await applySyncPlan(catalogRoot, plan);
  return { plan, applied: true };
}

export function formatInstallResult(result: InstallResult): string {
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
