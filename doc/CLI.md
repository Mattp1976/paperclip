# CLI Reference

Paperclip CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm orqestra --help
```

First-time local bootstrap + run:

```sh
pnpm orqestra run
```

Choose local instance:

```sh
pnpm orqestra run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `orqestra onboard` and `orqestra configure --section server` set deployment mode in config
- runtime can override mode with `PAPERCLIP_DEPLOYMENT_MODE`
- `orqestra run` and `orqestra doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm orqestra allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.paperclip`:

```sh
pnpm orqestra run --data-dir ./tmp/paperclip-dev
pnpm orqestra issue list --data-dir ./tmp/paperclip-dev
```

## Context Profiles

Store local defaults in `~/.paperclip/context.json`:

```sh
pnpm orqestra context set --api-base http://localhost:3100 --company-id <company-id>
pnpm orqestra context show
pnpm orqestra context list
pnpm orqestra context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm orqestra context set --api-key-env-var-name PAPERCLIP_API_KEY
export PAPERCLIP_API_KEY=...
```

## Company Commands

```sh
pnpm orqestra company list
pnpm orqestra company get <company-id>
pnpm orqestra company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm orqestra company delete PAP --yes --confirm PAP
pnpm orqestra company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `PAPERCLIP_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `PAPERCLIP_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm orqestra issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm orqestra issue get <issue-id-or-identifier>
pnpm orqestra issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm orqestra issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm orqestra issue comment <issue-id> --body "..." [--reopen]
pnpm orqestra issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm orqestra issue release <issue-id>
```

## Agent Commands

```sh
pnpm orqestra agent list --company-id <company-id>
pnpm orqestra agent get <agent-id>
pnpm orqestra agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` is the quickest way to run local Claude/Codex manually as a Paperclip agent:

- creates a new long-lived agent API key
- installs missing Paperclip skills into `~/.codex/skills` and `~/.claude/skills`
- prints `export ...` lines for `PAPERCLIP_API_URL`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_AGENT_ID`, and `PAPERCLIP_API_KEY`

Example for shortname-based local setup:

```sh
pnpm orqestra agent local-cli codexcoder --company-id <company-id>
pnpm orqestra agent local-cli claudecoder --company-id <company-id>
```

## Approval Commands

```sh
pnpm orqestra approval list --company-id <company-id> [--status pending]
pnpm orqestra approval get <approval-id>
pnpm orqestra approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm orqestra approval approve <approval-id> [--decision-note "..."]
pnpm orqestra approval reject <approval-id> [--decision-note "..."]
pnpm orqestra approval request-revision <approval-id> [--decision-note "..."]
pnpm orqestra approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm orqestra approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm orqestra activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm orqestra dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm orqestra heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.paperclip/instances/default`:

- config: `~/.paperclip/instances/default/config.json`
- embedded db: `~/.paperclip/instances/default/db`
- logs: `~/.paperclip/instances/default/logs`
- storage: `~/.paperclip/instances/default/data/storage`
- secrets key: `~/.paperclip/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm orqestra run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm orqestra configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
