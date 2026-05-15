import * as path from "node:path";

export function expandHome(input: string, homeDir: string): string {
  if (input === "~") {
    return homeDir;
  }

  if (input.startsWith("~/")) {
    return path.join(homeDir, input.slice(2));
  }

  return input;
}

export function resolvePath(input: string, baseDir: string, homeDir: string): string {
  const expanded = expandHome(input, homeDir);
  return path.resolve(baseDir, expanded);
}

export function displayPath(input: string, homeDir: string): string {
  const normalizedHome = path.resolve(homeDir);
  const normalizedInput = path.resolve(input);

  if (normalizedInput === normalizedHome) {
    return "~";
  }

  if (normalizedInput.startsWith(`${normalizedHome}${path.sep}`)) {
    return `~/${path.relative(normalizedHome, normalizedInput)}`;
  }

  return normalizedInput;
}
