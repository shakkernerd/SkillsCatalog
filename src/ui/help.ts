export const version = "0.1.0";

export function mainHelp(): string {
  return `skillcat ${version}

Usage:
  skillcat <command> [options]

Commands:
  init                 Create a skillcat catalog
  source add           Add a local skill source
  source list          List configured sources
  add                  Add a source skill to the catalog
  remove               Remove a catalog skill from catalog and targets
  install              Install catalog skills into a runtime target
  uninstall            Remove catalog skills from a runtime target
  list                 List catalog skills
  validate             Validate catalog sources and exports
  audit                Audit a runtime target
  sync                 Sync exports into a runtime target
  prune                Remove stale synced runtime links
  help                 Show this help

Options:
  --home <path>        Use a specific catalog root
  --help              Show help
  --version           Show version

Examples:
  skillcat init
  skillcat init --here
  skillcat source add /path/to/agent-scripts
  skillcat add agent-scripts/codex-review
  skillcat install codex-review --target codex
  skillcat source list
  skillcat validate
  skillcat audit codex
  skillcat sync codex --dry-run
  skillcat prune codex --dry-run
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
  skillcat source add <path> [--name <name>]
  skillcat source list

Options:
  --name <name>        Use a specific source name
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function addHelp(): string {
  return `skillcat add

Usage:
  skillcat add <source>/<skill> [--name <name>]

Options:
  --name <name>        Add the skill under another catalog name
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function exposeHelp(): string {
  return `skillcat expose

Usage:
  skillcat expose <source> <skill> [--name <name>]

Options:
  --name <name>        Export the skill under another name
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function installHelp(): string {
  return `skillcat install

Usage:
  skillcat install <skill...> --target <target> [--dry-run]

Options:
  --target <target>   Runtime target to install into
  --dry-run           Show planned installs without writing
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function removeHelp(): string {
  return `skillcat remove

Usage:
  skillcat remove <skill> [--dry-run]

Options:
  --dry-run           Show target removals without writing
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function runtimeUninstallHelp(): string {
  return `skillcat uninstall

Usage:
  skillcat uninstall <skill...> --target <target> [--dry-run]

Options:
  --target <target>   Runtime target to remove from
  --dry-run           Show planned removals without writing
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

export function auditHelp(): string {
  return `skillcat audit

Usage:
  skillcat audit <target>

Options:
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function syncHelp(): string {
  return `skillcat sync

Usage:
  skillcat sync <target> [--dry-run]

Options:
  --dry-run           Show planned actions without writing
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}

export function pruneHelp(): string {
  return `skillcat prune

Usage:
  skillcat prune <target> [--dry-run]

Options:
  --dry-run           Show planned removals without writing
  --home <path>        Use a specific catalog root
  --help              Show this help
`;
}
