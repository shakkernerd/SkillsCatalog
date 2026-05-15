import { SkillcatError } from "./errors.js";

export interface ParsedCli {
  command: string[];
  positional: string[];
  flags: Record<string, string | boolean>;
}

const stringFlags = new Set(["home", "name", "target"]);
const booleanFlags = new Set(["dry-run", "force", "help", "here", "version"]);

export function parseCli(argv: string[]): ParsedCli {
  const words: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let parsingFlags = true;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (parsingFlags && token === "--") {
      parsingFlags = false;
      continue;
    }

    if (parsingFlags && token.startsWith("--")) {
      const flag = token.slice(2);
      if (!flag) {
        throw new SkillcatError("Invalid empty flag");
      }

      if (stringFlags.has(flag)) {
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
          throw new SkillcatError(`--${flag} requires a value`);
        }

        flags[flag] = value;
        index += 1;
        continue;
      }

      if (booleanFlags.has(flag)) {
        flags[flag] = true;
        continue;
      }

      throw new SkillcatError(`Unknown flag --${flag}`);
    }

    words.push(token);
  }

  const commandLength = words[0] === "source" && (words[1] === "add" || words[1] === "list") ? 2 : Math.min(words.length, 1);
  const command = words.slice(0, commandLength);
  const positional = words.slice(commandLength);

  return { command, positional, flags };
}

export function flagBoolean(parsed: ParsedCli, name: string): boolean {
  return parsed.flags[name] === true;
}

export function flagString(parsed: ParsedCli, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}
