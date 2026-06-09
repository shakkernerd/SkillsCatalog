import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolveCatalogRoot } from "../catalog-root.js";
import { SkillcatError } from "../errors.js";
import { loadManifest, validateCatalogName, writeManifest } from "../manifest.js";
import { resolvePath } from "../paths.js";
import { assertDirectory, createDirectorySymlink } from "../core/fs.js";
import { listSourceSkills } from "../core/skills.js";

export interface SourceAddOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  name?: string;
  sourcePath: string;
}

export interface SourceAddResult {
  catalogRoot: string;
  name: string;
  sourcePath: string;
  skillCount: number;
  linkStatus: "created" | "exists";
  manifestChanged: boolean;
}

export async function runSourceAdd(options: SourceAddOptions): Promise<SourceAddResult> {
  const catalogRoot = await resolveCatalogRoot({
    cwd: options.cwd,
    env: options.env,
    home: options.homeDir,
    explicitHome: options.catalogHome
  });
  const manifest = await loadManifest(catalogRoot);
  const sourcePath = resolvePath(options.sourcePath, options.cwd ?? process.cwd(), options.homeDir ?? os.homedir());
  const sourceName = options.name ?? path.basename(sourcePath);
  validateCatalogName(sourceName, "source");

  await assertDirectory(sourcePath, "Source");
  const skills = await listSourceSkills(sourcePath);
  if (skills.length === 0) {
    throw new SkillcatError(`Source has no supported SKILL.md entries: ${sourcePath}`);
  }

  const existing = manifest.sources[sourceName];
  let manifestChanged = false;
  const linkPath = path.join(catalogRoot, "sources", sourceName);
  if (existing) {
    if (path.resolve(existing.path) !== path.resolve(sourcePath)) {
      throw new SkillcatError(`Source "${sourceName}" already points to ${existing.path}`);
    }

    const linkStatus = await createDirectorySymlink(linkPath, sourcePath);
    return {
      catalogRoot,
      name: sourceName,
      sourcePath,
      skillCount: skills.length,
      linkStatus,
      manifestChanged
    };
  }

  const linkStatus = await createDirectorySymlink(linkPath, sourcePath);
  manifest.sources[sourceName] = {
    type: "path",
    path: sourcePath
  };

  try {
    await writeManifest(catalogRoot, manifest);
    manifestChanged = true;
  } catch (error) {
    if (linkStatus === "created") {
      await fs.unlink(linkPath);
    }

    throw error;
  }

  return {
    catalogRoot,
    name: sourceName,
    sourcePath,
    skillCount: skills.length,
    linkStatus,
    manifestChanged
  };
}

export function formatSourceAddResult(result: SourceAddResult): string {
  const lines = [
    `source: ${result.name}`,
    `path: ${result.sourcePath}`,
    `skills: ${result.skillCount}`,
    `manifest: ${result.manifestChanged ? "updated" : "exists"}`,
    `link: ${result.linkStatus}`
  ];

  return `${lines.join("\n")}\n`;
}
