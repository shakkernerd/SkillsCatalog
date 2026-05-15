import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCatalogRoot } from "../src/catalog-root.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-root-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("resolveCatalogRoot", () => {
  it("prefers explicit home", async () => {
    await expect(resolveCatalogRoot({
      cwd: tmp,
      home: tmp,
      explicitHome: "~/catalog"
    })).resolves.toBe(path.join(tmp, "catalog"));
  });

  it("uses current directory for --here", async () => {
    await expect(resolveCatalogRoot({
      cwd: tmp,
      home: tmp,
      here: true
    })).resolves.toBe(tmp);
  });

  it("finds nearest parent manifest before environment fallback", async () => {
    const root = path.join(tmp, "root");
    const child = path.join(root, "a", "b");
    await fs.mkdir(child, { recursive: true });
    await fs.writeFile(path.join(root, "skillcat.json"), "{}");

    await expect(resolveCatalogRoot({
      cwd: child,
      home: tmp,
      env: { SKILLCAT_HOME: path.join(tmp, "env-root") }
    })).resolves.toBe(root);
  });

  it("uses SKILLCAT_HOME before default home", async () => {
    await expect(resolveCatalogRoot({
      cwd: tmp,
      home: tmp,
      env: { SKILLCAT_HOME: "./env-root" }
    })).resolves.toBe(path.join(tmp, "env-root"));
  });

  it("defaults to ~/.skillcat", async () => {
    await expect(resolveCatalogRoot({
      cwd: tmp,
      home: tmp,
      env: {}
    })).resolves.toBe(path.join(tmp, ".skillcat"));
  });
});
