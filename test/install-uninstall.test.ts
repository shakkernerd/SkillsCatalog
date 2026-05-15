import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { runInit } from "../src/commands/init.js";
import { runInstall } from "../src/commands/install.js";
import { runRuntimeUninstall } from "../src/commands/uninstall.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { loadManifest, writeManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-install-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("install and uninstall", () => {
  it("installs selected catalog skills into a target", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review", "npm"]);

    const result = await runInstall({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      targetName: "codex",
      skillNames: ["codex-review"]
    });

    expect(result.applied).toBe(true);
    expect((await fs.lstat(path.join(runtime, "codex-review"))).isSymbolicLink()).toBe(true);
    await expect(fs.lstat(path.join(runtime, "npm"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("dry-runs selected installs without writing runtime or state", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"]);

    const result = await runInstall({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      targetName: "codex",
      skillNames: ["codex-review"],
      dryRun: true
    });

    expect(result.plan.actions).toMatchObject([{ type: "create", name: "codex-review" }]);
    await expect(fs.lstat(path.join(runtime, "codex-review"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.lstat(path.join(catalog, "state", "targets", "codex.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports selected installs for skills missing from the catalog as conflicts", async () => {
    const { catalog } = await setupCatalog(["codex-review"]);

    const result = await runInstall({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      targetName: "codex",
      skillNames: ["missing"],
      dryRun: true
    });

    expect(result.plan.actions).toMatchObject([{ type: "conflict", name: "missing", reason: "not in catalog" }]);
  });

  it("uninstalls selected state-owned skills without removing them from the catalog", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"]);
    await runInstall({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", skillNames: ["codex-review"] });

    const result = await runRuntimeUninstall({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      targetName: "codex",
      skillNames: ["codex-review"]
    });

    expect(result.applied).toBe(true);
    await expect(fs.lstat(path.join(runtime, "codex-review"))).rejects.toMatchObject({ code: "ENOENT" });
    const manifest = await loadManifest(catalog);
    expect(manifest.exports["codex-review"]).toBeDefined();
  });

  it("uninstall skips skills not installed by skillcat", async () => {
    const { catalog } = await setupCatalog(["codex-review"]);

    const result = await runRuntimeUninstall({
      cwd: tmp,
      homeDir: tmp,
      catalogHome: catalog,
      targetName: "codex",
      skillNames: ["codex-review"],
      dryRun: true
    });

    expect(result.plan.actions).toMatchObject([{ type: "skip", name: "codex-review", reason: "not installed by skillcat" }]);
  });
});

async function setupCatalog(skills: string[]): Promise<{ catalog: string; source: string; runtime: string }> {
  const catalog = path.join(tmp, "catalog");
  const source = path.join(tmp, "agent-scripts");
  const runtime = path.join(tmp, "runtime");

  for (const skill of skills) {
    const skillRoot = path.join(source, "skills", skill);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skill}\ndescription: "${skill}"\n---\n`, "utf8");
  }

  await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
  const manifest = await loadManifest(catalog);
  manifest.targets.codex.path = runtime;
  await writeManifest(catalog, manifest);
  await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourcePath: source });
  for (const skill of skills) {
    await runAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, skillRef: `agent-scripts/${skill}` });
  }

  return { catalog, source, runtime };
}
