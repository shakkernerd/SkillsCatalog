import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExpose } from "../src/commands/expose.js";
import { runInit } from "../src/commands/init.js";
import { runPrune } from "../src/commands/prune.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { runSync } from "../src/commands/sync.js";
import { runUnexpose } from "../src/commands/unexpose.js";
import { loadManifest, writeManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-prune-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("prune", () => {
  it("dry-runs stale state-owned links without removing runtime or state", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);
    await runUnexpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, exportName: "codex-review" });

    const result = await runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });

    expect(result.applied).toBe(false);
    expect(result.plan.actions).toMatchObject([
      {
        type: "remove",
        name: "codex-review",
        reason: "no longer exported"
      }
    ]);
    expect((await fs.lstat(path.join(runtime, "codex-review"))).isSymbolicLink()).toBe(true);
    const state = await readState(catalog);
    expect(state.entries["codex-review"]).toBeDefined();
  });

  it("removes stale links and updates state", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);
    await runUnexpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, exportName: "codex-review" });

    const result = await runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });

    expect(result.applied).toBe(true);
    await expect(fs.lstat(path.join(runtime, "codex-review"))).rejects.toMatchObject({ code: "ENOENT" });
    const state = await readState(catalog);
    expect(state.entries["codex-review"]).toBeUndefined();
  });

  it("does not prune active exports", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);

    const result = await runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });

    expect(result.plan.actions).toMatchObject([
      {
        type: "skip",
        name: "codex-review",
        reason: "still exported"
      }
    ]);
    expect((await fs.lstat(path.join(runtime, "codex-review"))).isSymbolicLink()).toBe(true);
  });

  it("forgets missing stale runtime links", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);
    await runUnexpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, exportName: "codex-review" });
    await fs.rm(path.join(runtime, "codex-review"), { force: true });

    const result = await runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });

    expect(result.plan.actions).toMatchObject([
      {
        type: "forget",
        name: "codex-review",
        reason: "runtime link already missing"
      }
    ]);
    const state = await readState(catalog);
    expect(state.entries["codex-review"]).toBeUndefined();
  });

  it("reports changed symlink targets as conflicts and refuses apply", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);
    await runUnexpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, exportName: "codex-review" });
    const other = path.join(tmp, "other");
    await fs.mkdir(other);
    await fs.rm(path.join(runtime, "codex-review"));
    await fs.symlink(other, path.join(runtime, "codex-review"), "dir");

    const dryRun = await runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });
    expect(dryRun.plan.actions[0]).toMatchObject({
      type: "conflict",
      name: "codex-review"
    });

    await expect(runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" })).rejects.toThrow(
      "Prune has conflicts"
    );
    expect((await fs.lstat(path.join(runtime, "codex-review"))).isSymbolicLink()).toBe(true);
  });

  it("reports real directories at state paths as conflicts", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);
    await runUnexpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, exportName: "codex-review" });
    await fs.rm(path.join(runtime, "codex-review"));
    await fs.mkdir(path.join(runtime, "codex-review"));

    const result = await runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });

    expect(result.plan.actions).toMatchObject([
      {
        type: "conflict",
        name: "codex-review",
        reason: "runtime path is directory"
      }
    ]);
  });

  it("refuses corrupt state without removing runtime links", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);
    await fs.writeFile(path.join(catalog, "state", "targets", "codex.json"), "{ nope", "utf8");

    await expect(runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" })).rejects.toThrow(
      "Invalid target state"
    );
    expect((await fs.lstat(path.join(runtime, "codex-review"))).isSymbolicLink()).toBe(true);
  });

  it("reports runtime directory drift as a conflict", async () => {
    const { catalog, runtime } = await setupSyncedCatalog(["codex-review"]);
    const manifest = await loadManifest(catalog);
    manifest.targets.codex.path = path.join(tmp, "new-runtime");
    await writeManifest(catalog, manifest);

    const result = await runPrune({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", dryRun: true });

    expect(result.plan.actions).toMatchObject([
      {
        type: "conflict",
        name: "(state)",
        runtimePath: runtime,
        reason: "state runtimeDir differs from target runtimeDir"
      }
    ]);
  });
});

async function setupSyncedCatalog(skills: string[]): Promise<{ catalog: string; source: string; runtime: string }> {
  const catalog = path.join(tmp, "catalog");
  const source = path.join(tmp, "source");
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
  await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, name: "agent-scripts", sourcePath: source });
  for (const skill of skills) {
    await runExpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourceName: "agent-scripts", skillName: skill });
  }
  await runSync({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });

  return { catalog, source, runtime };
}

async function readState(catalog: string): Promise<{ entries: Record<string, unknown> }> {
  return JSON.parse(await fs.readFile(path.join(catalog, "state", "targets", "codex.json"), "utf8")) as {
    entries: Record<string, unknown>;
  };
}
