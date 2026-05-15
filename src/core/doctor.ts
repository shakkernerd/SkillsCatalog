import * as path from "node:path";
import type { AuditResult } from "./audit.js";
import type { ValidationIssue } from "./validate.js";

export type DoctorStatus = "ok" | "warn" | "error";

export interface DoctorReport {
  catalogRoot: string;
  manifest: DoctorSection;
  sources: DoctorSource[];
  skills: DoctorSkill[];
  targets: DoctorTarget[];
  issues: DoctorIssue[];
}

export interface DoctorSection {
  status: DoctorStatus;
  details: string;
}

export interface DoctorSource {
  name: string;
  path: string;
  status: DoctorStatus;
  details: string;
}

export interface DoctorSkill {
  name: string;
  source: string;
  path: string;
  status: DoctorStatus;
  details: string;
}

export interface DoctorTarget {
  name: string;
  path: string;
  status: DoctorStatus;
  details: string;
}

export interface DoctorIssue {
  status: "warn" | "error";
  message: string;
}

export function buildDoctorReport(input: {
  catalogRoot: string;
  validationIssues: ValidationIssue[];
  sources: Array<{ name: string; path: string; resolves: boolean; skillCount: number }>;
  skills: Array<{ name: string; source: string; path: string; resolvedPath: string }>;
  targets: AuditResult[];
}): DoctorReport {
  const issues: DoctorIssue[] = input.validationIssues.map((issue) => ({
    status: "error",
    message: issue.message
  }));

  const sources: DoctorSource[] = input.sources.map((source) => ({
    name: source.name,
    path: source.path,
    status: source.resolves ? "ok" : "error",
    details: source.resolves ? `${source.skillCount} skills` : "missing"
  }));

  const skills: DoctorSkill[] = input.skills.map((skill) => {
    const relatedIssues = input.validationIssues.filter((issue) => issue.message.includes(`"${skill.name}"`));
    return {
      name: skill.name,
      source: skill.source,
      path: skill.resolvedPath,
      status: relatedIssues.length === 0 ? "ok" : "error",
      details: relatedIssues.length === 0 ? `${skill.source}:${skill.path}` : relatedIssues.map((issue) => issue.message).join("; ")
    };
  });

  const targets: DoctorTarget[] = input.targets.map((target) => {
    const installed = target.entries.filter((entry) => entry.status === "export-linked").map((entry) => entry.name);
    const missing = target.entries.filter((entry) => entry.status === "missing-export").map((entry) => entry.name);
    const conflicts = target.entries.filter((entry) =>
      entry.status === "wrong-export-link" || entry.status === "export-path-conflict"
    );
    const unknown = target.entries.filter((entry) => entry.status === "unknown-path" || entry.status === "unknown-symlink");

    for (const entry of conflicts) {
      issues.push({
        status: "error",
        message: `${target.targetName}: ${entry.name} is ${entry.status}`
      });
    }

    for (const entry of unknown) {
      issues.push({
        status: "warn",
        message: `${target.targetName}: ${entry.name} is ${entry.status}`
      });
    }

    return {
      name: target.targetName,
      path: target.runtimeDir,
      status: conflicts.length > 0 ? "error" : unknown.length > 0 || missing.length > 0 ? "warn" : "ok",
      details: targetDetails({ installed, missing, unknown: unknown.map((entry) => entry.name), conflicts: conflicts.map((entry) => entry.name) })
    };
  });

  return {
    catalogRoot: input.catalogRoot,
    manifest: {
      status: input.validationIssues.length === 0 ? "ok" : "error",
      details: input.validationIssues.length === 0 ? "valid" : `${input.validationIssues.length} errors`
    },
    sources,
    skills,
    targets,
    issues
  };
}

function targetDetails(input: { installed: string[]; missing: string[]; unknown: string[]; conflicts: string[] }): string {
  const parts: string[] = [];
  if (input.installed.length > 0) {
    parts.push(`installed ${input.installed.join(", ")}`);
  }
  if (input.missing.length > 0) {
    parts.push(`missing ${input.missing.join(", ")}`);
  }
  if (input.unknown.length > 0) {
    parts.push(`unknown ${input.unknown.join(", ")}`);
  }
  if (input.conflicts.length > 0) {
    parts.push(`conflicts ${input.conflicts.join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : "no entries";
}

export function relativeDisplay(inputPath: string, homeDir: string): string {
  const normalized = path.resolve(inputPath);
  const home = path.resolve(homeDir);
  if (normalized === home) {
    return "~";
  }
  if (normalized.startsWith(`${home}${path.sep}`)) {
    return `~/${path.relative(home, normalized)}`;
  }
  return normalized;
}
