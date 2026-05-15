import * as os from "node:os";
import { resolveCatalogRoot } from "../catalog-root.js";
import { auditTarget } from "../core/audit.js";
import { buildDoctorReport, relativeDisplay, type DoctorReport } from "../core/doctor.js";
import { resolveTarget } from "../core/targets.js";
import { validateCatalog } from "../core/validate.js";
import { loadManifest } from "../manifest.js";
import { runList } from "./list.js";
import { runSourceList } from "./source-list.js";

export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  targetName?: string;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const homeDir = options.homeDir ?? os.homedir();
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const validation = await validateCatalog(catalogRoot, manifest);
  const sources = await runSourceList(options);
  const skills = await runList(options);
  const targetNames = options.targetName ? [options.targetName] : Object.keys(manifest.targets).sort();
  const targets = [];

  for (const targetName of targetNames) {
    const target = resolveTarget(manifest, targetName, catalogRoot, homeDir);
    targets.push(await auditTarget(catalogRoot, manifest, targetName, target.path));
  }

  return buildDoctorReport({
    catalogRoot,
    validationIssues: validation.issues,
    sources,
    skills,
    targets
  });
}

export function formatDoctorReport(report: DoctorReport, homeDir = os.homedir()): string {
  const lines = [`catalog: ${relativeDisplay(report.catalogRoot, homeDir)}`, `manifest: ${report.manifest.status}, ${report.manifest.details}`];

  lines.push("sources:");
  if (report.sources.length === 0) {
    lines.push("  none");
  } else {
    for (const source of report.sources) {
      lines.push(`  ${source.name}: ${source.status}, ${source.details}, ${relativeDisplay(source.path, homeDir)}`);
    }
  }

  lines.push("skills:");
  if (report.skills.length === 0) {
    lines.push("  none");
  } else {
    for (const skill of report.skills) {
      lines.push(`  ${skill.name}: ${skill.status}, ${skill.details}, ${relativeDisplay(skill.path, homeDir)}`);
    }
  }

  lines.push("targets:");
  if (report.targets.length === 0) {
    lines.push("  none");
  } else {
    for (const target of report.targets) {
      lines.push(`  ${target.name}: ${target.status}, ${target.details}, ${relativeDisplay(target.path, homeDir)}`);
    }
  }

  lines.push("issues:");
  if (report.issues.length === 0) {
    lines.push("  none");
  } else {
    for (const issue of report.issues) {
      lines.push(`  ${issue.status}: ${issue.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
