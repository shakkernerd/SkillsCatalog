import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runInit } from "../src/commands/init.js";
import { runInstall } from "../src/commands/install.js";
import { runRemove } from "../src/commands/remove.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { loadManifest, writeManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-remove-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("remove", () => {
  it("dry-runs target uninstall and catalog removal without writing", async () => {
    const { catalog, runtime } = await setupInstalledCatalog();

    const result = await runRemove({ cwd: tmp, homeDir: tmp, catalogHome: catalog, skillName: "codex-review", dryRun: true });

    expect(result.applied).toBe(false);
    expect(result.plans[0]?.actions).toMatchObject([{ type: "remove", name: "codex-review" }]);
    expect((await fs.lstat(path.join(runtime, "codex-review"))).isSymbolicLink()).toBe(true);
    const manifest = await loadManifest(catalog);
    expect(manifest.exports["codex-review"]).toBeDefined();
  });

  it("removes state-owned runtime installs before removing from the catalog", async () => {
    const { catalog, runtime } = await setupInstalledCatalog();

    await runRemove({ cwd: tmp, homeDir: tmp, catalogHome: catalog, skillName: "codex-review" });

    await expect(fs.lstat(path.join(runtime, "codex-review"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.lstat(path.join(catalog, "skills", "codex-review"))).rejects.toMatchObject({ code: "ENOENT" });
    const manifest = await loadManifest(catalog);
    expect(manifest.exports["codex-review"]).toBeUndefined();
  });

  it("refuses runtime conflicts and keeps the catalog skill", async () => {
    const { catalog, runtime } = await setupInstalledCatalog();
    const other = path.join(tmp, "other");
    await fs.mkdir(other);
    await fs.rm(path.join(runtime, "codex-review"));
    await fs.symlink(other, path.join(runtime, "codex-review"), "dir");

    await expect(runRemove({ cwd: tmp, homeDir: tmp, catalogHome: catalog, skillName: "codex-review" })).rejects.toThrow(
      "Remove has runtime conflicts"
    );
    const manifest = await loadManifest(catalog);
    expect(manifest.exports["codex-review"]).toBeDefined();
  });
});

async function setupInstalledCatalog(): Promise<{ catalog: string; source: string; runtime: string }> {
  const catalog = path.join(tmp, "catalog");
  const source = path.join(tmp, "agent-scripts");
  const runtime = path.join(tmp, "runtime");
  const skillRoot = path.join(source, "skills", "codex-review");
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: codex-review\ndescription: \"Review\"\n---\n", "utf8");

  await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
  const manifest = await loadManifest(catalog);
  manifest.targets.codex.path = runtime;
  await writeManifest(catalog, manifest);
  await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourcePath: source });
  await runAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, skillRef: "agent-scripts/codex-review" });
  await runInstall({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", skillNames: ["codex-review"] });

  return { catalog, source, runtime };
}
