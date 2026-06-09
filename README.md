# skillcat

**One catalog for every agent skill you own. Install exactly what you want, into any runtime, without breaking anything.**

[![npm version](https://img.shields.io/npm/v/skillcat.svg)](https://www.npmjs.com/package/skillcat)
[![license: MIT](https://img.shields.io/npm/l/skillcat.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/skillcat.svg)](https://nodejs.org)
[![status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

> Status: early alpha (`0.1.x`). The CLI surface is stabilising; expect small breaks until `1.0`.

---

## The Problem

Your agent skills live everywhere.

- A `codex-review` skill in one personal repo.
- A `pr-summary` skill your team uses in a shared repo.
- Three more you copy-pasted from a gist and lost track of.
- And `~/.codex/skills` is now a graveyard of half-broken symlinks you're scared to clean up.

Meanwhile every agent runtime — Codex today, Claude and friends tomorrow — wants its own special folder, its own special layout, and silently overwrites things when it feels like it.

You shouldn't need a shell script and a prayer to keep this sane.

## The Fix

`skillcat` is a tiny CLI that turns this:

```text
~/Projects/agent-scripts/skills/...
~/Work/team-prompts/skills/...
~/Downloads/random-gist-skill/...
~/.codex/skills/  ← chaos
```

into this:

```text
sources  →  your catalog (~/.skillcat)  →  agent runtimes (Codex, Claude, ...)
```

One place to curate. One command to install. Runtime folders stay generated, replaceable, and **never silently clobbered**.

## Why You'll Like It

- **One catalog, many sources.** Add any folder of skills as a source. Add only the skills you want to your catalog.
- **Install one, many, or all.** `install`, `sync`, `uninstall`, `prune` — they all do exactly what they say.
- **Safe by default.** Won't overwrite real directories, unknown symlinks, or protected runtime entries. Every destructive command supports `--dry-run`.
- **Runtime-agnostic.** Codex today. Built so Claude and other runtimes slot in cleanly — same catalog, different target.
- **No hidden state in runtimes.** Ownership tracking lives under your catalog, never inside `~/.codex/skills` or `~/.claude/skills`.
- **Repo-local catalogs.** `skillcat init --here` for project-scoped setups. Same commands, different home.
- **No Bash.** Pure TypeScript. Cross-platform, debuggable, testable.

## Install

Requires **Node 20+** and a Node package manager.

```sh
npm install -g skillcat
# or
pnpm add -g skillcat
# or run without installing
npx skillcat@latest --help
```

## 60-Second Quick Start

```sh
# 1. create your catalog (defaults to ~/.skillcat)
skillcat init

# 2. point it at a folder full of skills
skillcat source add ~/Projects/agent-scripts
skillcat source add ~/Work/team-prompts --name team

# 3. curate what you actually want
skillcat add agent-scripts/codex-review
skillcat add team/pr-summary

# 4. preview, then install into Codex
skillcat install codex-review --target codex --dry-run
skillcat install codex-review --target codex

# 5. or sync the whole catalog
skillcat sync codex
```

Check on things:

```sh
skillcat list        # what's in the catalog
skillcat validate    # is the catalog healthy
skillcat doctor      # is the runtime healthy
skillcat audit codex # what's actually in ~/.codex/skills
```

## How It's Laid Out

```text
~/.skillcat/
├── skillcat.json   # catalog manifest
├── sources/        # registered source folders
├── skills/         # curated skills available for install
├── state/          # per-runtime ownership state
└── cache/
```

Want a repo-local catalog instead?

```sh
skillcat init --here
skillcat --home ./catalog doctor   # or scope a single command
```

## Runtime Safety (The Important Part)

Agent runtime folders are *generated*. They shouldn't fear `skillcat`, and `skillcat` shouldn't fear them.

The rules:

- Protected entries (e.g. Codex's `.system`, `codex-primary-runtime`) are **never** touched.
- Real directories are **never** overwritten.
- Unknown symlinks are **never** overwritten.
- State-owned symlinks that have drifted are **never** removed silently — `doctor` reports them, you decide.
- Every destructive command supports `--dry-run`.
- Ownership state lives in your catalog, not in the runtime folder.

If `skillcat` doesn't know it put something there, it leaves it alone. Full stop.

## Command Reference

<details>
<summary><strong>Initialize</strong></summary>

```sh
skillcat init [--here] [--home <path>]
```
</details>

<details>
<summary><strong>Sources</strong></summary>

```sh
skillcat source add <path> [--name <name>]
skillcat source list
```
</details>

<details>
<summary><strong>Catalog</strong></summary>

```sh
skillcat add <source>/<skill> [--name <name>]
skillcat remove <skill> [--dry-run]
skillcat list
```
</details>

<details>
<summary><strong>Runtime installs</strong></summary>

```sh
skillcat install   <skill...> --target <target> [--dry-run]
skillcat uninstall <skill...> --target <target> [--dry-run]
skillcat sync      <target>                     [--dry-run]
skillcat prune     <target>                     [--dry-run]
```
</details>

<details>
<summary><strong>Inspect health</strong></summary>

```sh
skillcat validate
skillcat doctor [target]
skillcat audit  <target>
```
</details>

### Exit Codes

| Command            | Exits nonzero when                          |
| ------------------ | ------------------------------------------- |
| `validate`         | catalog has errors                          |
| `doctor`           | runtime has errors (warnings are exit `0`)  |
| `audit`            | read-only — exits `0` if target is readable |
| any `--dry-run`    | conflicts would be introduced               |

## Status

`skillcat` is **alpha** (`0.1.x`). The catalog format and CLI surface may shift slightly before `1.0`. The safety guarantees above are not optional and will not regress.

Currently shipping:

- ✅ Codex runtime target
- ✅ Multiple sources, curated catalog, dry runs everywhere
- ✅ `doctor` / `audit` / `validate`

On the roadmap:

- 🔜 Claude runtime target
- 🔜 Remote sources (git URLs)
- 🔜 Skill version pinning

## Develop From Source

```sh
pnpm install
pnpm build
pnpm skillcat --help

# or run TypeScript directly
pnpm start --help

# tests
pnpm test
pnpm check   # tsc + vitest
```

## Contributing

Issues and PRs welcome — especially:

- new runtime targets
- real-world catalog layouts that break things
- safety edge cases

File issues at [github.com/shakkernerd/SkillsCatalog/issues](https://github.com/shakkernerd/SkillsCatalog/issues).

## License

[MIT](./LICENSE)
