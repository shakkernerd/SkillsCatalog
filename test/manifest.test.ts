import { describe, expect, it } from "vitest";
import { createDefaultManifest, validateManifest } from "../src/manifest.js";

describe("validateManifest", () => {
  it("accepts the default manifest", () => {
    expect(validateManifest(createDefaultManifest())).toEqual(createDefaultManifest());
  });

  it("rejects exports that reference missing sources", () => {
    expect(() => validateManifest({
      version: 1,
      sources: {},
      exports: {
        "codex-review": {
          source: "agent-scripts",
          path: "skills/codex-review"
        }
      },
      targets: {}
    })).toThrow('Export "codex-review" references unknown source "agent-scripts"');
  });

  it("rejects unsafe names", () => {
    expect(() => validateManifest({
      version: 1,
      sources: {
        "../bad": {
          type: "path",
          path: "/tmp/bad"
        }
      },
      exports: {},
      targets: {}
    })).toThrow('Invalid source name "../bad"');
  });
});
