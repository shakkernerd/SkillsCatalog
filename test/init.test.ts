import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";
import { loadManifest } from "../src/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-init-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("runInit", () => {
  it("creates the default catalog under the provided home", async () => {
    const result = await runInit({
      cwd: tmp,
      homeDir: tmp,
      env: {}
    });

    const root = path.join(tmp, ".skillcat");
    expect(result.catalogRoot).toBe(root);
    expect(result.createdManifest).toBe(true);
    await expect(loadManifest(root)).resolves.toMatchObject({
      version: 1,
      targets: {
        codex: {
          path: "~/.codex/skills",
          protected: [".system", "codex-primary-runtime"]
        }
      }
    });
    expect((await fs.stat(path.join(root, "skills"))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, "sources"))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, "state", "targets"))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(root, "cache"))).isDirectory()).toBe(true);
  });

  it("is idempotent", async () => {
    await runInit({ cwd: tmp, homeDir: tmp, env: {} });
    const result = await runInit({ cwd: tmp, homeDir: tmp, env: {} });

    expect(result.createdManifest).toBe(false);
    expect(result.createdDirectories).toEqual([]);
  });

  it("can initialize the current directory", async () => {
    const result = await runInit({
      cwd: tmp,
      homeDir: tmp,
      here: true,
      env: {}
    });

    expect(result.catalogRoot).toBe(tmp);
    await expect(loadManifest(tmp)).resolves.toMatchObject({ version: 1 });
  });
});
