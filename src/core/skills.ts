import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface SkillEntry {
  name: string;
  path: string;
}

export async function listSourceSkills(sourceRoot: string): Promise<SkillEntry[]> {
  const skillsRoot = path.join(sourceRoot, "skills");
  let entries;

  try {
    entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    const skillPath = path.join(skillsRoot, entry.name);
    try {
      const stat = await fs.stat(path.join(skillPath, "SKILL.md"));
      if (stat.isFile()) {
        skills.push({ name: entry.name, path: skillPath });
      }
    } catch {
      continue;
    }
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}
