# Token Guardian MCP Design

## Goal

Build a local, read-only MCP server that shows where Claude Code and Codex tokens are going and recommends the cheapest model and effort level that preserves the required quality.

## Safety boundary

- The server never edits Claude, Codex, MCP, gateway, compaction, model, or effort settings.
- The server never starts, stops, restarts, or registers itself with a client.
- The server never calls a model or paid API.
- Usage collection runs `ccusage` with offline pricing and no-cost output.
- Codex metadata is read from `state_5.sqlite` in read-only mode.
- Missing or ambiguous evidence produces a conservative frontier recommendation.
- Tool annotations declare every operation read-only, non-destructive, idempotent, and closed-world.

## Architecture

The TypeScript stdio server uses the MCP TypeScript SDK v2 and Zod 4. Business logic remains independent from the MCP transport so it can be tested without launching a client.

`usage.ts` invokes `ccusage` through `execFile`, parses its JSON, and optionally joins Codex session IDs to local thread titles through Node's read-only SQLite API. `analysis.ts` calculates cache share, model concentration, oversized sessions, duplicate Codex titles, and a short list of evidence-backed quick wins. `routing.ts` applies deterministic routing rules. `server.ts` exposes those functions as MCP tools, and `index.ts` connects the server over stdio.

## Tools

### `token_guardian_usage_snapshot`

Inputs:

- `days`: integer from 1 through 30, default 7.
- `top_sessions`: integer from 1 through 20, default 10.
- `agent`: `all`, `claude`, or `codex`, default `all`.

Returns:

- Time window and aggregate tokens by agent and model.
- Cache-read share, output share, and frontier-model share.
- Largest sessions with IDs, models, last activity, and Codex titles when available.
- Duplicate exact-title Codex work when detected.
- Quick wins with exact evidence, expected mechanism, risk, and whether they are safe to apply automatically.

The output deliberately avoids equating raw processed tokens with subscription-meter usage.

### `token_guardian_recommend_route`

Inputs:

- `client`: `claude`, `codex`, or `local`.
- `task_summary`: 1 to 2,000 characters.
- `task_kind`: optional explicit classification.
- `risk`: `low`, `normal`, `high`, or `critical`, default `normal`.
- `context_tokens`: optional current context size.
- `current_model` and `current_effort`: optional current route.

Returns:

- Recommended model and effort.
- Optional frontier validator route.
- Confidence and reasons.
- Escalation conditions.
- A clear statement that the result is advice only.

## Routing policy

- Mechanical extraction, formatting, bounded lookup, and boilerplate use the local model or the cheapest hosted tier.
- Normal coding, testing, and bounded debugging use the balanced tier.
- Architecture, security, production changes, destructive work, high-stakes review, and critical risk stay on the frontier tier.
- Normal coding on a balanced tier gets a frontier completion validator when failure would be costly.
- More than 180,000 context tokens triggers a milestone-handoff recommendation before further work.
- `max`, `ultracode`, or equivalent modes are never recommended globally. They require an explicitly demanding task and a measurable reason.
- Ambiguous classifications fail closed to the current stronger route or a frontier route.

## Current model mapping

| Client | Cheapest | Balanced | Frontier |
| --- | --- | --- | --- |
| Codex | GPT-5.6 Luna, low | GPT-5.6 Terra, medium | GPT-5.6 Sol, high or xhigh |
| Claude | Haiku, low | Sonnet, high | Opus, high or xhigh |
| Local | configured local model | configured local model plus frontier validator | hosted frontier model |

Model names are policy data rather than automatic provider calls. Updating them cannot change a live client.

## Quick-win rules

- Flag sessions above 25 million processed tokens as large and above 50 million as urgent milestone-handoff candidates.
- If cache reads exceed 90 percent, state that caching is already strong and prioritize repeated long-context replay instead.
- If more than 80 percent of usage is on frontier models, recommend cheaper routing for mechanical and bounded work.
- Flag exact duplicate Codex titles in the selected window.
- If output and reasoning are small relative to cache reads, explain that repeated context replay is the dominant mechanism.

## Verification

- Unit tests cover every routing class and fail-closed behavior.
- Fixture-based tests cover usage aggregation, quick-win thresholds, and malformed `ccusage` output.
- An MCP in-memory client lists and calls both tools.
- `npm test`, `npm run typecheck`, and `npm run build` must pass.
- A live offline snapshot is run only after fixture tests pass.
- Registration with Claude, Codex, or the shared gateway is a separate later change.
