import { resolveCatalogRoot } from "../catalog-root.js";
import { loadManifest } from "../manifest.js";
import { exportSourcePath } from "../core/exports.js";

export interface ListOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
}

export interface ListEntry {
  name: string;
  source: string;
  path: string;
  resolvedPath: string;
}

export async function runList(options: ListOptions = {}): Promise<ListEntry[]> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);

  return Object.entries(manifest.exports)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, entry]) => ({
      name,
      source: entry.source,
      path: entry.path,
      resolvedPath: exportSourcePath(manifest, entry)
    }));
}

export function formatList(entries: ListEntry[]): string {
  if (entries.length === 0) {
    return "skills: none\n";
  }

  return `${entries.map((entry) => `${entry.name}: ${entry.source}:${entry.path}, ${entry.resolvedPath}`).join("\n")}\n`;
}
