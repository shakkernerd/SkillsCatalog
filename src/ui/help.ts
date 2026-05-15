export const version = "0.1.0";

export function mainHelp(): string {
  return `skillcat ${version}

Usage:
  skillcat <command> [options]

Commands:
  init                 Create a skillcat catalog
  source add           Add a local skill source
  source list          List configured sources
  expose               Expose a source skill
  unexpose             Remove an exposed skill
  list                 List exposed skills
  help                 Show this help

Options:
  --home <path>        Use a specific catalog root
  --help              Show help
  --version           Show version

Examples:
  skillcat init
  skillcat init --here
  skillcat source add agent-scripts /path/to/agent-scripts
  skillcat expose agent-scripts codex-review
  skillcat source list
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

export function sourceHelp(): string {
  return `skillcat source

Usage:
  skillcat source add <name> <path>
  skillcat source list

Options:
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function exposeHelp(): string {
  return `skillcat expose

Usage:
  skillcat expose <source> <skill> [--as <name>]

Options:
  --as <name>          Export the skill under another name
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function unexposeHelp(): string {
  return `skillcat unexpose

Usage:
  skillcat unexpose <name>

Options:
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}
