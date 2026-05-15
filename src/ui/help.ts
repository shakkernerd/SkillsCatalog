export const version = "0.1.0";

export function mainHelp(): string {
  return `skillcat ${version}

Usage:
  skillcat <command> [options]

Commands:
  init                 Create a skillcat catalog
  help                 Show this help

Options:
  --home <path>        Use a specific catalog root
  --help              Show help
  --version           Show version

Examples:
  skillcat init
  skillcat init --here
  skillcat --home ./catalog init
`;
}

export function initHelp(): string {
  return `skillcat init

Usage:
  skillcat init [options]

Options:
  --here              Initialize the current directory
  --home <path>        Initialize a specific catalog root
  --force             Recreate missing catalog folders when a manifest exists
  --help              Show this help
`;
}
