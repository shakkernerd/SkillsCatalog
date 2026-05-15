import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExpose } from "../src/commands/expose.js";
import { runInit } from "../src/commands/init.js";
import { runList } from "../src/commands/list.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { runUnexpose } from "../src/commands/unexpose.js";
import { loadManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-export-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("export commands", () => {
  it("exposes a source skill into the catalog skill surface", async () => {
    const { catalog, source } = await setupCatalog(["codex-review"]);

    const result = await runExpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      sourceName: "agent-scripts",
      skillName: "codex-review"
    });

    expect(result).toMatchObject({
      exportName: "codex-review",
      sourceName: "agent-scripts",
      skillPath: path.join(source, "skills", "codex-review"),
      linkStatus: "created",
      manifestChanged: true
    });

    const manifest = await loadManifest(catalog);
    expect(manifest.exports["codex-review"]).toEqual({
      source: "agent-scripts",
      path: "skills/codex-review"
    });

    const linkPath = path.join(catalog, "skills", "codex-review");
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(path.resolve(path.dirname(linkPath), await fs.readlink(linkPath))).toBe(path.join(source, "skills", "codex-review"));
  });

  it("supports exposing a skill under an alias", async () => {
    const { catalog, source } = await setupCatalog(["codex-review"]);

    await runExpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      sourceName: "agent-scripts",
      skillName: "codex-review",
      asName: "review"
    });

    await expect(runList({ cwd: tmp, homeDir: tmp, catalogHome: catalog })).resolves.toEqual([
      {
        name: "review",
        source: "agent-scripts",
        path: "skills/codex-review",
        resolvedPath: path.join(source, "skills", "codex-review")
      }
    ]);
  });

  it("is idempotent for the same export", async () => {
    const { catalog } = await setupCatalog(["codex-review"]);
    await runExpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourceName: "agent-scripts", skillName: "codex-review" });

    const result = await runExpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      sourceName: "agent-scripts",
      skillName: "codex-review"
    });

    expect(result.linkStatus).toBe("exists");
    expect(result.manifestChanged).toBe(false);
  });

  it("refuses export collisions", async () => {
    const { catalog } = await setupCatalog(["codex-review", "npm"]);
    await runExpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      sourceName: "agent-scripts",
      skillName: "codex-review",
      asName: "tool"
    });

    await expect(runExpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      sourceName: "agent-scripts",
      skillName: "npm",
      asName: "tool"
    })).rejects.toThrow('Export "tool" already points to agent-scripts:skills/codex-review');
  });

  it("refuses protected target names", async () => {
    const { catalog } = await setupCatalog(["codex-review"]);

    await expect(runExpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      sourceName: "agent-scripts",
      skillName: "codex-review",
      asName: ".system"
    })).rejects.toThrow('Export ".system" conflicts with protected codex entry');
  });

  it("refuses to unexpose a real directory", async () => {
    const { catalog } = await setupCatalog(["codex-review"]);
    await runExpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourceName: "agent-scripts", skillName: "codex-review" });
    await fs.rm(path.join(catalog, "skills", "codex-review"));
    await fs.mkdir(path.join(catalog, "skills", "codex-review"));

    await expect(runUnexpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      exportName: "codex-review"
    })).rejects.toThrow("Refusing to remove non-symlink export");

    const manifest = await loadManifest(catalog);
    expect(manifest.exports["codex-review"]).toBeDefined();
  });

  it("unexposes only the expected symlink and updates the manifest", async () => {
    const { catalog } = await setupCatalog(["codex-review"]);
    await runExpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourceName: "agent-scripts", skillName: "codex-review" });

    await expect(runUnexpose({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      exportName: "codex-review"
    })).resolves.toEqual({
      exportName: "codex-review",
      linkStatus: "removed"
    });

    const manifest = await loadManifest(catalog);
    expect(manifest.exports["codex-review"]).toBeUndefined();
    await expect(fs.lstat(path.join(catalog, "skills", "codex-review"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function setupCatalog(skills: string[]): Promise<{ catalog: string; source: string }> {
  const catalog = path.join(tmp, "catalog");
  const source = path.join(tmp, "source");
  for (const skill of skills) {
    const skillRoot = path.join(source, "skills", skill);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skill}\ndescription: "${skill}"\n---\n`, "utf8");
  }

  await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
  await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, name: "agent-scripts", sourcePath: source });

  return { catalog, source };
}
