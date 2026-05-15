# skillcat

Curate agent skills from multiple sources and sync selected skills into agent runtime directories.

`skillcat` is early-stage. The first implementation supports catalog initialization and manifest handling.

```sh
pnpm install
pnpm build
pnpm dev -- --help
pnpm dev -- init --here
```

## Local catalog flow

```sh
pnpm dev -- init --here
pnpm dev -- source add agent-scripts /path/to/agent-scripts
pnpm dev -- expose agent-scripts codex-review
pnpm dev -- list
pnpm dev -- validate
```
