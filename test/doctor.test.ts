import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAdd } from "../src/commands/add.js";
import { formatDoctorReport, runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { runInstall } from "../src/commands/install.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { loadManifest, writeManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-doctor-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("doctor", () => {
  it("summarizes a valid catalog and target", async () => {
    const { catalog } = await setupCatalog(true);

    const report = await runDoctor({ cwd: tmp, homeDir: tmp, catalogHome: catalog });

    expect(report.manifest).toEqual({ status: "ok", details: "valid" });
    expect(report.sources).toMatchObject([{ name: "agent-scripts", status: "ok", details: "1 skills" }]);
    expect(report.skills).toMatchObject([{ name: "codex-review", status: "ok" }]);
    expect(report.targets).toMatchObject([{ name: "codex", status: "ok" }]);
    expect(report.issues).toEqual([]);
  });

  it("reports unknown runtime entries as warnings", async () => {
    const { catalog, runtime } = await setupCatalog(true);
    await fs.mkdir(path.join(runtime, "local-skill"));

    const report = await runDoctor({ cwd: tmp, homeDir: tmp, catalogHome: catalog });

    expect(report.targets[0]).toMatchObject({ status: "warn" });
    expect(report.issues).toContainEqual({
      status: "warn",
      message: "codex: local-skill is unknown-path"
    });
  });

  it("reports invalid skill frontmatter as a manifest error", async () => {
    const { catalog, source } = await setupCatalog(false);
    await fs.writeFile(path.join(source, "skills", "codex-review", "SKILL.md"), "---\nname: [\n---\n", "utf8");

    const report = await runDoctor({ cwd: tmp, homeDir: tmp, catalogHome: catalog });

    expect(report.manifest.status).toBe("error");
    expect(report.issues.some((issue) => issue.status === "error" && issue.message.includes("frontmatter is invalid YAML"))).toBe(true);
  });

  it("formats a concise report", async () => {
    const { catalog } = await setupCatalog(true);

    const output = formatDoctorReport(await runDoctor({ cwd: tmp, homeDir: tmp, catalogHome: catalog }), tmp);

    expect(output).toContain("catalog: ~/catalog");
    expect(output).toContain("manifest: ok, valid");
    expect(output).toContain("agent-scripts: ok, 1 skills");
    expect(output).toContain("codex-review: ok");
    expect(output).toContain("issues:\n  none");
  });
});

async function setupCatalog(install: boolean): Promise<{ catalog: string; source: string; runtime: string }> {
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
  if (install) {
    await runInstall({ cwd: tmp, homeDir: tmp, catalogHome: catalog, targetName: "codex", skillNames: ["codex-review"] });
  }

  return { catalog, source, runtime };
}
