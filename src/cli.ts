#!/usr/bin/env node
import * as os from "node:os";
import { parseCli, flagBoolean, flagString } from "./cli-parser.js";
import { runInit, formatInitResult } from "./commands/init.js";
import { SkillcatError } from "./errors.js";
import { initHelp, mainHelp, version } from "./ui/help.js";

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
