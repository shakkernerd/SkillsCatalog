import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { version } from "../src/generated/version.js";

describe("version", () => {
  it("matches package.json", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };

    expect(version).toBe(packageJson.version);
  });
});
