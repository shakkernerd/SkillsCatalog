import { resolveCatalogRoot } from "../catalog-root.js";
import { auditTarget, type AuditResult } from "../core/audit.js";
import { resolveTarget } from "../core/targets.js";
import { loadManifest } from "../manifest.js";

export interface AuditOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  targetName: string;
}

export async function runAudit(options: AuditOptions): Promise<AuditResult> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const target = resolveTarget(manifest, options.targetName, catalogRoot, options.homeDir);
  return auditTarget(catalogRoot, manifest, options.targetName, target.path);
}

export function formatAuditResult(result: AuditResult): string {
  const lines = [`target: ${result.targetName}`, `path: ${result.runtimeDir}`];
  if (result.entries.length === 0) {
    lines.push("entries: none");
    return `${lines.join("\n")}\n`;
  }

  for (const entry of result.entries) {
    const parts = [entry.name, entry.status];
    if (entry.actualTarget) {
      parts.push(`actual=${entry.actualTarget}`);
    }
    if (entry.expectedTarget) {
      parts.push(`expected=${entry.expectedTarget}`);
    }
    if (entry.details) {
      parts.push(entry.details);
    }
    lines.push(parts.join(": "));
  }

  return `${lines.join("\n")}\n`;
}
