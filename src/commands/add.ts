import { runExpose, formatExposeResult, type ExposeResult } from "./expose.js";
import { SkillcatError } from "../errors.js";

export interface AddOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  catalogHome?: string;
  skillRef: string;
  name?: string;
}

export async function runAdd(options: AddOptions): Promise<ExposeResult> {
  const [sourceName, skillName, extra] = options.skillRef.split("/");
  if (!sourceName || !skillName || extra) {
    throw new SkillcatError("add requires <source>/<skill>");
  }

  return runExpose({
    cwd: options.cwd,
    env: options.env,
    homeDir: options.homeDir,
    catalogHome: options.catalogHome,
    sourceName,
    skillName,
    asName: options.name
  });
}

export const formatAddResult = formatExposeResult;
