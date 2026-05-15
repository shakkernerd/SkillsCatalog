import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAudit } from "../src/commands/audit.js";
import { runExpose } from "../src/commands/expose.js";
import { runInit } from "../src/commands/init.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { loadManifest, writeManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-audit-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("audit", () => {
  it("classifies missing exports and protected entries", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"]);
    await fs.mkdir(path.join(runtime, ".system"), { recursive: true });

    const result = await runAudit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });
    expect(statuses(result.entries)).toEqual({
      ".system": "protected",
      "codex-primary-runtime": "protected",
      "codex-review": "missing-export"
    });
  });

  it("classifies correct and wrong export symlinks", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review", "npm"]);
    await fs.symlink(path.relative(runtime, path.join(catalog, "skills", "codex-review")), path.join(runtime, "codex-review"), "dir");
    const other = path.join(tmp, "other");
    await fs.mkdir(other);
    await fs.symlink(other, path.join(runtime, "npm"), "dir");

    const result = await runAudit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });
    expect(statuses(result.entries)).toMatchObject({
      "codex-review": "export-linked",
      npm: "wrong-export-link"
    });
  });

  it("classifies unknown runtime entries", async () => {
    const { catalog, runtime } = await setupCatalog(["codex-review"]);
    const unknownTarget = path.join(tmp, "unknown-target");
    await fs.mkdir(unknownTarget);
    await fs.mkdir(path.join(runtime, "local-skill"));
    await fs.symlink(unknownTarget, path.join(runtime, "unknown-link"), "dir");

    const result = await runAudit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });
    expect(statuses(result.entries)).toMatchObject({
      "local-skill": "unknown-path",
      "unknown-link": "unknown-symlink"
    });
  });

  it("uses an empty audit when the runtime dir does not exist", async () => {
    const { catalog } = await setupCatalog(["codex-review"], false);

    const result = await runAudit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex" });
    expect(statuses(result.entries)).toMatchObject({
      "codex-review": "missing-export"
    });
  });
});

function statuses(entries: { name: string; status: string }[]): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [entry.name, entry.status]));
}

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
