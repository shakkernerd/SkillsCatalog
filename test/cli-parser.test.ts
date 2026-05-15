import { describe, expect, it } from "vitest";
import { parseCli } from "../src/cli-parser.js";

describe("parseCli", () => {
  it("parses command, boolean flags, string flags, and positionals", () => {
    expect(parseCli(["source", "add", "agent-scripts", "--home", "./cat", "--force"])).toEqual({
      command: ["source", "add"],
      positional: ["agent-scripts"],
      flags: {
        home: "./cat",
        force: true
      }
    });
  });

  it("rejects unknown flags", () => {
    expect(() => parseCli(["init", "--wat"])).toThrow("Unknown flag --wat");
  });

  it("requires string flag values", () => {
    expect(() => parseCli(["init", "--home"])).toThrow("--home requires a value");
  });
});
