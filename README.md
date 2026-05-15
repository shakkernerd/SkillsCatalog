# skillcat

Curate agent skills from multiple sources and sync selected skills into agent runtime directories.

`skillcat` is early-stage. The first implementation supports catalog initialization and manifest handling.

```sh
pnpm install
pnpm build
pnpm skillcat --help
pnpm start init --here
```

## Local catalog flow

```sh
pnpm start init --here
pnpm start source add agent-scripts /path/to/agent-scripts
pnpm start expose agent-scripts codex-review
pnpm start list
pnpm start validate
```
