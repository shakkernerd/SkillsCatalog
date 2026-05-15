import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExpose } from "../src/commands/expose.js";
import { runInit } from "../src/commands/init.js";
import { runSourceAdd } from "../src/commands/source-add.js";
import { runValidate } from "../src/commands/validate.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-validate-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("validate", () => {
  it("passes for a valid catalog", async () => {
    const { catalog } = await setupValidCatalog();

    await expect(runValidate({ cwd: tmp, homeDir: tmp, catalogHome: catalog })).resolves.toEqual({
      issues: []
    });
  });

  it("reports a missing source path", async () => {
    const { catalog, source } = await setupValidCatalog();
    await fs.rm(source, { recursive: true, force: true });

    const result = await runValidate({ cwd: tmp, homeDir: tmp, catalogHome: catalog });
    expect(result.issues.map((issue) => issue.message)).toContain(`Source "agent-scripts" does not exist: ${source}`);
  });

  it("reports an export link that points somewhere unexpected", async () => {
    const { catalog } = await setupValidCatalog();
    await fs.rm(path.join(catalog, "skills", "codex-review"));
    const other = path.join(tmp, "other");
    await fs.mkdir(other);
    await fs.symlink(other, path.join(catalog, "skills", "codex-review"), "dir");

    const result = await runValidate({ cwd: tmp, homeDir: tmp, catalogHome: catalog });
    expect(result.issues.some((issue) => issue.message.includes('Export "codex-review" link points to'))).toBe(true);
  });

  it("reports invalid skill frontmatter", async () => {
    const { catalog, source } = await setupValidCatalog();
    await fs.writeFile(path.join(source, "skills", "codex-review", "SKILL.md"), "---\nname: [\n---\n", "utf8");

    const result = await runValidate({ cwd: tmp, homeDir: tmp, catalogHome: catalog });
    expect(result.issues.some((issue) => issue.message.includes("frontmatter is invalid YAML"))).toBe(true);
  });
});

async function setupValidCatalog(): Promise<{ catalog: string; source: string }> {
  const catalog = path.join(tmp, "catalog");
  const source = path.join(tmp, "source");
  const skillRoot = path.join(source, "skills", "codex-review");
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: codex-review\ndescription: \"Review code\"\n---\n", "utf8");

  await runInit({ cwd: tmp, homeDir: tmp, catalogHome: catalog, env: {} });
  await runSourceAdd({ cwd: tmp, homeDir: tmp, catalogHome: catalog, name: "agent-scripts", sourcePath: source });
  await runExpose({ cwd: tmp, homeDir: tmp, catalogHome: catalog, sourceName: "agent-scripts", skillName: "codex-review" });

  return { catalog, source };
}
