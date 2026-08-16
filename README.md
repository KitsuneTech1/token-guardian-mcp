# Token Guardian MCP

Token Guardian is a local, read-only MCP server for finding Claude Code and Codex token waste without making either client dumber.

It does two jobs:

- Reports which agents, models, and sessions are processing the most tokens.
- Recommends the cheapest safe model and effort level for a specific task.

## Hard safety boundary

Token Guardian cannot change model settings, effort levels, context limits, compaction, MCP registration, or running sessions. It has no model credentials and makes no paid API calls.

The usage tool calls `ccusage` with `--offline` and `--no-cost`. Codex titles are optional metadata read through `sqlite3 -readonly`. Every MCP tool is marked read-only, non-destructive, idempotent, and closed-world.

## Tools

### `token_guardian_usage_snapshot`

Reads one through thirty days of local usage and returns:

- Totals by agent and model
- Cache-read, output, and frontier-model shares
- Largest sessions
- Exact duplicate Codex work titles
- Evidence-backed quick wins

Processed tokens are a workload diagnostic. They are not the same as a subscription meter, especially when cached input dominates.

### `token_guardian_recommend_route`

Accepts the client, task, risk, and current context size. It returns a model, effort level, reasons, and an optional frontier validator.

The policy fails closed. Security, architecture, production, destructive, high-risk, critical, or ambiguous work stays on a frontier model. Cheap models handle bounded mechanical work. Balanced models handle normal coding and debugging, with a frontier review when needed.

## Local requirements

- Node.js 24 or newer
- `ccusage` on PATH
- `sqlite3` on PATH for optional Codex thread titles

## Build and test

```powershell
npm install
npm test
npm run typecheck
npm run build
```

Run the built stdio server:

```powershell
node dist/index.js
```

Inspect it without registering it in a live client:

```powershell
npx @modelcontextprotocol/inspector node dist/index.js
```

## Registration status

This first build is intentionally not registered with Claude, Codex, or the shared Kitsune gateway. Registration and any client restart are a separate change after the isolated server is accepted.
