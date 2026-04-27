---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm orqestra issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm orqestra issue get <issue-id-or-identifier>

# Create issue
pnpm orqestra issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm orqestra issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm orqestra issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm orqestra issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm orqestra issue release <issue-id>
```

## Company Commands

```sh
pnpm orqestra company list
pnpm orqestra company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm orqestra company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm orqestra company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# Apply import
pnpm orqestra company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm orqestra agent list
pnpm orqestra agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm orqestra approval list [--status pending]

# Get approval
pnpm orqestra approval get <approval-id>

# Create approval
pnpm orqestra approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm orqestra approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm orqestra approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm orqestra approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm orqestra approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm orqestra approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm orqestra activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm orqestra dashboard get
```

## Heartbeat

```sh
pnpm orqestra heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
