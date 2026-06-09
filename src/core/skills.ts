import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SkillcatError } from "../errors.js";
import { readSkillFrontmatter, type SkillFrontmatter } from "./frontmatter.js";

export interface SkillEntry {
  name: string;
  path: string;
  relativePath: string;
  frontmatter: SkillFrontmatter;
}

export const skillContainerPaths = [
  "skills",
  "skills/.curated",
  "skills/.experimental",
  "skills/.system",
  ".agents/skills",
  ".claude/skills",
  ".cline/skills",
  ".codebuddy/skills",
  ".codex/skills",
  ".commandcode/skills",
  ".continue/skills",
  ".github/skills",
  ".goose/skills",
  ".iflow/skills",
  ".junie/skills",
  ".kilocode/skills",
  ".kiro/skills",
  ".mux/skills",
  ".neovate/skills",
  ".opencode/skills",
  ".openhands/skills",
  ".pi/skills",
  ".qoder/skills",
  ".roo/skills",
  ".trae/skills",
  ".windsurf/skills",
  ".zencoder/skills"
] as const;

const skipDirectories = new Set([".git", "node_modules", "dist", "build", "__pycache__"]);

export async function listSourceSkills(sourceRoot: string): Promise<SkillEntry[]> {
  const skills = new Map<string, SkillEntry>();
  await addSkillIfPresent(skills, sourceRoot, sourceRoot);

  for (const containerPath of skillContainerPaths) {
    await addSkillsFromContainer(skills, sourceRoot, path.join(sourceRoot, containerPath));
  }

  return [...skills.values()].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name);
    return nameOrder === 0 ? left.relativePath.localeCompare(right.relativePath) : nameOrder;
  });
}

export async function findSourceSkill(sourceRoot: string, skillName: string): Promise<SkillEntry> {
  const matches = (await listSourceSkills(sourceRoot)).filter((skill) => skill.name === skillName);
  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    const paths = matches.map((skill) => skill.relativePath).join(", ");
    throw new SkillcatError(`Source skill "${skillName}" is ambiguous: ${paths}`);
  }

  throw new SkillcatError(`Source has no skill "${skillName}": ${sourceRoot}`);
}

async function addSkillsFromContainer(skills: Map<string, SkillEntry>, sourceRoot: string, container: string): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(container, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    if (skipDirectories.has(entry.name)) {
      continue;
    }

    const skillPath = path.join(container, entry.name);
    if (await addSkillIfPresent(skills, sourceRoot, skillPath)) {
      continue;
    }

    await addNestedSkillsFromContainer(skills, sourceRoot, skillPath);
  }
}

async function addNestedSkillsFromContainer(skills: Map<string, SkillEntry>, sourceRoot: string, container: string): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(container, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if ((!entry.isDirectory() && !entry.isSymbolicLink()) || skipDirectories.has(entry.name)) {
      continue;
    }

    await addSkillIfPresent(skills, sourceRoot, path.join(container, entry.name));
  }
}

async function addSkillIfPresent(skills: Map<string, SkillEntry>, sourceRoot: string, skillPath: string): Promise<boolean> {
  const skillFile = path.join(skillPath, "SKILL.md");
  try {
    const stat = await fs.stat(skillFile);
    if (!stat.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = await readSkillFrontmatter(skillFile);
  } catch {
    return false;
  }

  const relativePath = normalizeRelativePath(path.relative(sourceRoot, skillPath)) || ".";
  skills.set(relativePath, {
    name: path.basename(skillPath),
    path: skillPath,
    relativePath,
    frontmatter
  });
  return true;
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}
