import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { runSourceList } from "../src/commands/source-list.js";
import { loadManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-source-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("source commands", () => {
  it("adds a local source and creates a catalog source symlink", async () => {
    const catalog = path.join(tmp, "catalog");
    const source = await createSourceRepo("agent-scripts", ["codex-review", "npm"]);
    await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });

    const result = await runSourceAdd({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      name: "agent-scripts",
      sourcePath: source
    });

    expect(result).toMatchObject({
      name: "agent-scripts",
      sourcePath: source,
      skillCount: 2,
      linkStatus: "created",
      manifestChanged: true
    });

    const manifest = await loadManifest(catalog);
    expect(manifest.sources["agent-scripts"]).toEqual({
      type: "path",
      path: source
    });

    const linkPath = path.join(catalog, "sources", "agent-scripts");
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(path.resolve(path.dirname(linkPath), await fs.readlink(linkPath))).toBe(source);
  });

  it("is idempotent for the same source", async () => {
    const catalog = path.join(tmp, "catalog");
    const source = await createSourceRepo("agent-scripts", ["codex-review"]);
    await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
    await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, name: "agent-scripts", sourcePath: source });

    const result = await runSourceAdd({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      name: "agent-scripts",
      sourcePath: source
    });

    expect(result.linkStatus).toBe("exists");
    expect(result.manifestChanged).toBe(false);
  });

  it("refuses to reuse a source name for a different path", async () => {
    const catalog = path.join(tmp, "catalog");
    const first = await createSourceRepo("first", ["one"]);
    const second = await createSourceRepo("second", ["two"]);
    await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
    await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, name: "agent-scripts", sourcePath: first });

    await expect(runSourceAdd({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      name: "agent-scripts",
      sourcePath: second
    })).rejects.toThrow('Source "agent-scripts" already points to');
  });

  it("refuses a source with no skills", async () => {
    const catalog = path.join(tmp, "catalog");
    const source = path.join(tmp, "empty-source");
    await fs.mkdir(source, { recursive: true });
    await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });

    await expect(runSourceAdd({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      name: "empty",
      sourcePath: source
    })).rejects.toThrow("Source has no skills/*/SKILL.md entries");
  });

  it("does not update the manifest when the source link path collides", async () => {
    const catalog = path.join(tmp, "catalog");
    const source = await createSourceRepo("agent-scripts", ["codex-review"]);
    await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
    await fs.mkdir(path.join(catalog, "sources", "agent-scripts"));

    await expect(runSourceAdd({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      name: "agent-scripts",
      sourcePath: source
    })).rejects.toThrow("Refusing to replace existing path");

    const manifest = await loadManifest(catalog);
    expect(manifest.sources["agent-scripts"]).toBeUndefined();
  });

  it("lists source status and skill counts", async () => {
    const catalog = path.join(tmp, "catalog");
    const source = await createSourceRepo("agent-scripts", ["codex-review", "npm"]);
    await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
    await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, name: "agent-scripts", sourcePath: source });

    await expect(runSourceList({ cwd: tmp, homeDir: tmp, catalogHome: catalog })).resolves.toEqual([
      {
        name: "agent-scripts",
        path: source,
        resolves: true,
        skillCount: 2
      }
    ]);
  });
});

async function createSourceRepo(name: string, skills: string[]): Promise<string> {
  const root = path.join(tmp, name);
  for (const skill of skills) {
    const skillRoot = path.join(root, "skills", skill);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skill}\ndescription: "${skill}"\n---\n`, "utf8");
  }

  return root;
}
