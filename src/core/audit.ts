import * as path from "node:path";
import type { SkillcatManifest } from "../manifest.js";
import { readRuntimeEntries, type RuntimeEntry } from "./targets.js";

export type AuditStatus =
  | "protected"
  | "export-linked"
  | "missing-export"
  | "wrong-export-link"
  | "export-path-conflict"
  | "unknown-symlink"
  | "unknown-path";

export interface AuditEntry {
  name: string;
  status: AuditStatus;
  runtimePath?: string;
  expectedTarget?: string;
  actualTarget?: string;
  details?: string;
}

export interface AuditResult {
  targetName: string;
  runtimeDir: string;
  entries: AuditEntry[];
}

export async function auditTarget(
  catalogRoot: string,
  manifest: SkillcatManifest,
  targetName: string,
  runtimeDir: string
): Promise<AuditResult> {
  const target = manifest.targets[targetName];
  const runtimeEntries = await readRuntimeEntries(runtimeDir);
  const entries: AuditEntry[] = [];
  const seen = new Set<string>();

  for (const protectedName of target.protected) {
    const runtimeEntry = runtimeEntries.get(protectedName);
    entries.push({
      name: protectedName,
      status: "protected",
      runtimePath: runtimeEntry?.path ?? path.join(runtimeDir, protectedName),
      details: runtimeEntry ? "present" : "not present"
    });
    seen.add(protectedName);
  }

  for (const exportName of Object.keys(manifest.exports).sort()) {
    if (target.protected.includes(exportName)) {
      continue;
    }

    const expectedTarget = path.join(catalogRoot, "skills", exportName);
    const runtimePath = path.join(runtimeDir, exportName);
    const runtimeEntry = runtimeEntries.get(exportName);
    seen.add(exportName);

    if (!runtimeEntry) {
      entries.push({
        name: exportName,
        status: "missing-export",
        runtimePath,
        expectedTarget
      });
      continue;
    }

    entries.push(classifyExportEntry(runtimeEntry, expectedTarget));
  }

  for (const [name, runtimeEntry] of [...runtimeEntries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (seen.has(name)) {
      continue;
    }

    entries.push({
      name,
      status: runtimeEntry.kind === "symlink" ? "unknown-symlink" : "unknown-path",
      runtimePath: runtimeEntry.path,
      actualTarget: runtimeEntry.resolvedTarget
    });
  }

  return {
    targetName,
    runtimeDir,
    entries
  };
}

function classifyExportEntry(runtimeEntry: RuntimeEntry, expectedTarget: string): AuditEntry {
  if (runtimeEntry.kind !== "symlink") {
    return {
      name: runtimeEntry.name,
      status: "export-path-conflict",
      runtimePath: runtimeEntry.path,
      expectedTarget,
      details: runtimeEntry.kind
    };
  }

  if (path.resolve(runtimeEntry.resolvedTarget ?? "") !== path.resolve(expectedTarget)) {
    return {
      name: runtimeEntry.name,
      status: "wrong-export-link",
      runtimePath: runtimeEntry.path,
      expectedTarget,
      actualTarget: runtimeEntry.resolvedTarget
    };
  }

  return {
    name: runtimeEntry.name,
    status: "export-linked",
    runtimePath: runtimeEntry.path,
    expectedTarget,
    actualTarget: runtimeEntry.resolvedTarget
  };
}
