#!/usr/bin/env node
import * as os from "node:os";
import { parseCli, flagBoolean, flagString } from "./cli-parser.js";
import { runInit, formatInitResult } from "./commands/init.js";
import { runSourceAdd, formatSourceAddResult } from "./commands/source-add.js";
import { runSourceList, formatSourceList } from "./commands/source-list.js";
import { SkillcatError } from "./errors.js";
import { initHelp, mainHelp, sourceHelp, version } from "./ui/help.js";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseCli(argv);

    if (flagBoolean(parsed, "version")) {
      process.stdout.write(`${version}\n`);
      return 0;
    }

    if (parsed.command.length === 0 || parsed.command[0] === "help" || flagBoolean(parsed, "help")) {
      if (parsed.command[0] === "init") {
        process.stdout.write(initHelp());
      } else if (parsed.command[0] === "source") {
        process.stdout.write(sourceHelp());
      } else {
        process.stdout.write(mainHelp());
      }
      return 0;
    }

    const [command] = parsed.command;

    if (command === "init") {
      if (parsed.command.length !== 1 || parsed.positional.length !== 0) {
        throw new SkillcatError("init does not accept positional arguments");
      }

      const result = await runInit({
        catalogHome: flagString(parsed, "home"),
        here: flagBoolean(parsed, "here"),
        force: flagBoolean(parsed, "force")
      });
      process.stdout.write(formatInitResult(result, os.homedir()));
      return 0;
    }

    if (command === "source") {
      const subcommand = parsed.command[1];

      if (subcommand === "add") {
        if (parsed.positional.length !== 2) {
          throw new SkillcatError("source add requires <name> and <path>");
        }

        const [name, sourcePath] = parsed.positional;
        const result = await runSourceAdd({
          catalogHome: flagString(parsed, "home"),
          name,
          sourcePath
        });
        process.stdout.write(formatSourceAddResult(result));
        return 0;
      }

      if (subcommand === "list") {
        if (parsed.positional.length !== 0) {
          throw new SkillcatError("source list does not accept positional arguments");
        }

        const result = await runSourceList({
          catalogHome: flagString(parsed, "home")
        });
        process.stdout.write(formatSourceList(result));
        return 0;
      }

      throw new SkillcatError("source requires a subcommand: add or list");
    }

    throw new SkillcatError(`Unknown command "${parsed.command.join(" ")}"`);
  } catch (error) {
    if (error instanceof SkillcatError) {
      process.stderr.write(`error: ${error.message}\n`);
      return error.exitCode;
    }

    throw error;
  }
}

main().then((exitCode) => {
  process.exitCode = exitCode;
});
