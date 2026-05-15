import * as path from "node:path";
import { resolveCatalogRoot } from "../catalog-root.js";
import { loadManifest } from "../manifest.js";
import { pathExists } from "../core/fs.js";
import { listSourceSkills } from "../core/skills.js";

export interface SourceListOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
}

export interface SourceListEntry {
  name: string;
  path: string;
  resolves: boolean;
  skillCount: number;
}

export async function runSourceList(options: SourceListOptions = {}): Promise<SourceListEntry[]> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const entries: SourceListEntry[] = [];

  for (const [name, source] of Object.entries(manifest.sources).sort(([left], [right]) => left.localeCompare(right))) {
    const sourcePath = path.resolve(source.path);
    const resolves = await pathExists(sourcePath);
    entries.push({
      name,
      path: source.path,
      resolves,
      skillCount: resolves ? (await listSourceSkills(sourcePath)).length : 0
    });
  }

  return entries;
}

export function formatSourceList(entries: SourceListEntry[]): string {
  if (entries.length === 0) {
    return "sources: none\n";
  }

  return `${entries.map((entry) => {
    const status = entry.resolves ? "ok" : "missing";
    return `${entry.name}: ${status}, ${entry.skillCount} skills, ${entry.path}`;
  }).join("\n")}\n`;
}
