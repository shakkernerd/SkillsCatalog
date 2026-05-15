import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter } from "../src/core/frontmatter.js";

describe("parseSkillFrontmatter", () => {
  it("parses simple YAML frontmatter", () => {
    expect(parseSkillFrontmatter("---\nname: codex-review\ndescription: \"Review code\"\n---\nbody\n")).toEqual({
      name: "codex-review",
      description: "Review code"
    });
  });

  it("rejects missing frontmatter", () => {
    expect(() => parseSkillFrontmatter("name: codex-review\n")).toThrow("must start with YAML frontmatter");
  });

  it("rejects invalid YAML frontmatter", () => {
    expect(() => parseSkillFrontmatter("---\nname: [\n---\n")).toThrow("frontmatter is invalid YAML");
  });

  it("requires name and description", () => {
    expect(() => parseSkillFrontmatter("---\nname: codex-review\n---\n")).toThrow("description must be a non-empty string");
  });
});
