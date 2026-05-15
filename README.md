# skillcat

Curate agent skills from multiple sources and install selected skills into agent runtime directories.

`skillcat` keeps the catalog you control separate from runtime folders owned by tools such as Codex.

```text
sources -> catalog skills -> runtime targets
```

## Install

From this source checkout:

```sh
pnpm install
pnpm build
pnpm skillcat --help
```

For development, run the TypeScript source directly:

```sh
pnpm start --help
```

After publishing, the intended install flow is:

```sh
npm install -g skillcat
skillcat --help
```

## Catalogs

By default, commands use:

```text
~/.skillcat
```

Initialize the default catalog:

```sh
skillcat init
```

Initialize the current directory as a repo-local catalog:

```sh
skillcat init --here
```

Use a specific catalog root for one command:

```sh
skillcat --home ./catalog init
skillcat --home ./catalog doctor
```

A catalog contains:

```text
skillcat.json
skills/
sources/
state/
cache/
```

- `sources/`: linked source repos or folders containing skills.
- `skills/`: curated catalog skills.
- `state/`: local machine state for runtime targets.
- `skillcat.json`: source, skill, and target configuration.

## Basic Flow

Add a source. If no name is provided, the folder name is used:

```sh
skillcat source add /Users/me/Projects/agent-scripts
```

Use `--name` when the folder name is not the desired source name:

```sh
skillcat source add /path/to/repo --name shared
```

Add a skill from a source to the catalog:

```sh
skillcat add agent-scripts/codex-review
```

Add it under a different catalog name:

```sh
skillcat add agent-scripts/codex-review --name review
```

Check the catalog:

```sh
skillcat source list
skillcat list
skillcat validate
skillcat doctor
```

Install one catalog skill into Codex:

```sh
skillcat install codex-review --target codex --dry-run
skillcat install codex-review --target codex
```

Install every catalog skill into Codex:

```sh
skillcat sync codex --dry-run
skillcat sync codex
```

## Removing Skills

Remove a skill from one runtime target, but keep it in the catalog:

```sh
skillcat uninstall codex-review --target codex --dry-run
skillcat uninstall codex-review --target codex
```

Remove a skill from the catalog and all state-owned target installs:

```sh
skillcat remove codex-review --dry-run
skillcat remove codex-review
```

Clean up state-owned runtime links that are no longer in the catalog:

```sh
skillcat prune codex --dry-run
skillcat prune codex
```

## Safety Model

`skillcat` treats runtime directories as generated targets, not source of truth.

For Codex, the runtime target is:

```text
~/.codex/skills
```

The catalog remains:

```text
~/.skillcat
```

Runtime writes are conservative:

- protected target entries are not touched
- real directories are not overwritten
- unknown symlinks are not overwritten
- changed state-owned symlinks are not removed
- state is written under the catalog, not under the runtime directory
- destructive commands support `--dry-run`

Codex protected entries start as:

```text
.system
codex-primary-runtime
```

Unknown runtime entries are reported but left alone. For example, if `~/.codex/skills/ocm-operator` already exists and was not created by this catalog, `doctor` and `audit` report it as unknown.

## Commands

```sh
skillcat init [--here] [--home <path>]
```

Create the catalog layout and default manifest.

```sh
skillcat source add <path> [--name <name>]
skillcat source list
```

Add and inspect source folders.

```sh
skillcat add <source>/<skill> [--name <name>]
skillcat remove <skill> [--dry-run]
skillcat list
```

Manage catalog skills.

```sh
skillcat install <skill...> --target <target> [--dry-run]
skillcat uninstall <skill...> --target <target> [--dry-run]
skillcat sync <target> [--dry-run]
skillcat prune <target> [--dry-run]
```

Manage runtime target links.

```sh
skillcat validate
skillcat doctor [target]
skillcat audit <target>
```

Inspect catalog and target health.

## Exit Behavior

- `validate` exits nonzero when catalog validation has errors.
- `doctor` exits nonzero for errors, but exits zero for warnings.
- `audit` is read-only and exits zero when the target can be inspected.
- `install --dry-run`, `sync --dry-run`, `uninstall --dry-run`, and `prune --dry-run` exit nonzero when they report conflicts.

## Current Limitations

- local path sources are supported; Git source cloning is not implemented yet
- Codex is the only default target
- package version is still defined in source and package metadata separately
