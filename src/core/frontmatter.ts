import * as fs from "node:fs/promises";
import { parseDocument } from "yaml";
import { SkillcatError } from "../errors.js";

export interface SkillFrontmatter {
  name: string;
  description: string;
}

export async function readSkillFrontmatter(skillFile: string): Promise<SkillFrontmatter> {
  const raw = await fs.readFile(skillFile, "utf8");
  return parseSkillFrontmatter(raw, skillFile);
}

export function parseSkillFrontmatter(raw: string, label = "SKILL.md"): SkillFrontmatter {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new SkillcatError(`${label} must start with YAML frontmatter`);
  }

  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) {
    throw new SkillcatError(`${label} frontmatter is not closed`);
  }

  const yamlSource = lines.slice(1, endIndex).join("\n");
  const document = parseDocument(yamlSource);
  if (document.errors.length > 0) {
    throw new SkillcatError(`${label} frontmatter is invalid YAML: ${document.errors[0]?.message ?? "unknown error"}`);
  }

  const value = document.toJSON();
  if (!isRecord(value)) {
    throw new SkillcatError(`${label} frontmatter must be a YAML object`);
  }

  if (!isNonEmptyString(value.name)) {
    throw new SkillcatError(`${label} frontmatter name must be a non-empty string`);
  }

  if (!isNonEmptyString(value.description)) {
    throw new SkillcatError(`${label} frontmatter description must be a non-empty string`);
  }

  return {
    name: value.name,
    description: value.description
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
