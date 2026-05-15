import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExpose } from "../src/commands/expose.js";
import { runInit } from "../src/commands/init.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { runSync } from "../src/commands/sync.js";
import { loadManifest, writeManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("sync", () => {
  it("dry-runs missing export links without writing runtime or state", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"], false);

    const result = await runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });

    expect(result.applied).toBe(false);
    expect(result.plan.actions).toMatchObject([
      {
        type: "create",
        name: "codex-review",
        reason: "missing runtime link"
      }
    ]);
    await expect(fs.lstat(runtime)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.lstat(path.join(catalog, "state", "targets", "codex.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates missing runtime links and writes state", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"], false);

    const result = await runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });

    expect(result.applied).toBe(true);
    const linkPath = path.join(runtime, "codex-review");
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(path.resolve(runtime, await fs.readlink(linkPath))).toBe(path.join(catalog, "skills", "codex-review"));

    const state = JSON.parse(await fs.readFile(path.join(catalog, "state", "targets", "codex.json"), "utf8")) as {
      entries: Record<string, { runtimePath: string; exportPath: string; createdBy: string }>;
    };
    expect(state.entries["codex-review"]).toEqual({
      runtimePath: linkPath,
      exportPath: path.join(catalog, "skills", "codex-review"),
      mode: "symlink",
      createdBy: "skillcat"
    });
  });

  it("skips already-correct runtime links", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"]);
    await fs.symlink(path.relative(runtime, path.join(catalog, "skills", "codex-review")), path.join(runtime, "codex-review"), "dir");

    const result = await runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });

    expect(result.plan.actions).toMatchObject([
      {
        type: "skip",
        name: "codex-review",
        reason: "already linked"
      }
    ]);
  });

  it("reports conflicts for existing real directories", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"]);
    await fs.mkdir(path.join(runtime, "codex-review"));

    const result = await runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });

    expect(result.plan.actions).toMatchObject([
      {
        type: "conflict",
        name: "codex-review",
        reason: "existing directory"
      }
    ]);
  });

  it("reports conflicts for wrong symlinks and refuses apply", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"]);
    const other = path.join(tmp, "other");
    await fs.mkdir(other);
    await fs.symlink(other, path.join(runtime, "codex-review"), "dir");

    const dryRun = await runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });
    expect(dryRun.plan.actions[0]).toMatchObject({
      type: "conflict",
      name: "codex-review"
    });

    await expect(runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" })).rejects.toThrow(
      "Sync has conflicts"
    );
    await expect(fs.lstat(path.join(catalog, "state", "targets", "codex.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports protected export names as conflicts", async () => {
    const { catalog } = await setupCatalog(["codex-review"]);
    const manifest = await loadManifest(catalog);
    manifest.exports[".system"] = manifest.exports["codex-review"];
    await writeManifest(catalog, manifest);

    const result = await runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });
    expect(result.plan.actions.some((action) => action.type === "conflict" && action.name === ".system")).toBe(true);
  });
});

async function setupCatalog(skills: string[], createRuntime = true): Promise<{ catalog: string; source: string; runtime: string }> {
  const catalog = path.join(tmp, "catalog");
  const source = path.join(tmp, "source");
  const runtime = path.join(tmp, "runtime");

  for (const skill of skills) {
    const skillRoot = path.join(source, "skills", skill);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skill}\ndescription: "${skill}"\n---\n`, "utf8");
  }

  if (createRuntime) {
    await fs.mkdir(runtime, { recursive: true });
  }

  await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
  const manifest = await loadManifest(catalog);
  manifest.targets.codex.path = runtime;
  await writeManifest(catalog, manifest);
  await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, name: "agent-scripts", sourcePath: source });
  for (const skill of skills) {
    await runExpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourceName: "agent-scripts", skillName: skill });
  }

  return { catalog, source, runtime };
}
