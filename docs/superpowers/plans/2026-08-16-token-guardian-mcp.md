# Token Guardian MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested local MCP server that reports token drains and recommends conservative model and effort routes without changing any client configuration.

**Architecture:** Keep usage collection, analysis, routing policy, and MCP transport in separate TypeScript modules. Use `ccusage --offline` for cross-client token data and read Codex thread metadata from SQLite with read-only access. Expose two stdio MCP tools with structured output.

**Tech Stack:** Node.js 24, TypeScript 7, MCP TypeScript SDK 2, Zod 4, Vitest 4.

## Global Constraints

- No network or paid model calls at runtime.
- No configuration writes, registration, process control, or automatic model switching.
- Every tool is read-only, non-destructive, idempotent, and closed-world.
- Ambiguous recommendations fail closed to the stronger route.
- Use test-first red, green, refactor cycles.
- Keep all user-facing text free of em dashes, en dashes, smart quotes, and corporate filler.

---

### Task 1: Routing policy

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`
- Create: `src/routing.ts`
- Test: `test/routing.test.ts`

**Interfaces:**
- Consumes: `RouteRequest` with client, task summary, task kind, risk, context size, and current route.
- Produces: `recommendRoute(request: RouteRequest): RouteRecommendation`.

- [ ] **Step 1: Add package and TypeScript configuration**

Use ESM, strict TypeScript, Node 24, Vitest, MCP SDK v2, and Zod 4. Add `test`, `typecheck`, `build`, and `start` scripts.

- [ ] **Step 2: Write failing routing tests**

Cover these exact behaviors:

```ts
expect(recommendRoute({ client: "codex", taskSummary: "Extract fields", taskKind: "mechanical", risk: "low" }).model).toBe("gpt-5.6-luna");
expect(recommendRoute({ client: "codex", taskSummary: "Implement bounded API tests", taskKind: "coding", risk: "normal" }).model).toBe("gpt-5.6-terra");
expect(recommendRoute({ client: "claude", taskSummary: "Review production auth", taskKind: "security", risk: "high" }).model).toBe("opus");
expect(recommendRoute({ client: "codex", taskSummary: "unclear", risk: "normal" }).tier).toBe("frontier");
expect(recommendRoute({ client: "codex", taskSummary: "Refactor parser", taskKind: "coding", risk: "normal", contextTokens: 200000 }).actions).toContain("Start a milestone handoff before continuing.");
```

- [ ] **Step 3: Run the tests and verify red**

Run: `npm test -- test/routing.test.ts`

Expected: failure because `src/routing.ts` does not exist.

- [ ] **Step 4: Implement the minimal routing policy**

Define literal unions for clients, kinds, risks, tiers, and effort levels. Implement explicit table-driven mappings and the conservative fallback. Add a frontier validator for balanced normal-risk coding and debugging.

- [ ] **Step 5: Run the routing tests and verify green**

Run: `npm test -- test/routing.test.ts`

Expected: all routing tests pass.

### Task 2: Usage collection and quick-win analysis

**Files:**
- Create: `src/usage.ts`
- Create: `src/analysis.ts`
- Test: `test/analysis.test.ts`
- Test: `test/usage.test.ts`

**Interfaces:**
- Consumes: `loadUsage(options, dependencies)` where dependencies inject the command runner and optional Codex thread lookup.
- Produces: normalized `UsageReport` data and `analyzeUsage(report, options): UsageSnapshot`.

- [ ] **Step 1: Write failing fixture tests**

Use a small in-memory `ccusage` fixture. Assert that analysis:

```ts
expect(snapshot.metrics.cacheReadShare).toBeCloseTo(0.95);
expect(snapshot.quickWins.map((item) => item.code)).toContain("cache_already_strong");
expect(snapshot.quickWins.map((item) => item.code)).toContain("oversized_session");
expect(snapshot.quickWins.map((item) => item.code)).toContain("frontier_everywhere");
```

Also assert malformed JSON returns an actionable error and never falls back to an online call.

- [ ] **Step 2: Run the usage tests and verify red**

Run: `npm test -- test/analysis.test.ts test/usage.test.ts`

Expected: failure because the usage modules do not exist.

- [ ] **Step 3: Implement normalized usage loading**

Invoke:

```text
ccusage --json --sections daily,session --by-agent --since YYYY-MM-DD --no-cost --offline
```

Use `execFile`, a 30-second timeout, a 25 MiB output cap, and JSON validation. Open `state_5.sqlite` with `readOnly: true` only when it exists. Never expose database errors as stack traces.

- [ ] **Step 4: Implement deterministic analysis**

Calculate aggregate shares, sort and cap sessions, join Codex titles, detect exact normalized duplicate titles, and emit threshold-based quick wins. Every finding must include numeric evidence and `autoApply: false`.

- [ ] **Step 5: Run the usage tests and verify green**

Run: `npm test -- test/analysis.test.ts test/usage.test.ts`

Expected: all usage tests pass.

### Task 3: MCP tools and transport

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: `createTokenGuardianServer(dependencies?)`.
- Produces: an MCP server exposing `token_guardian_usage_snapshot` and `token_guardian_recommend_route`.

- [ ] **Step 1: Write the failing MCP integration test**

Connect an MCP client and server using the SDK in-memory transport. Assert the tool list is deterministic, both tools carry read-only annotations, route output is structured, and usage output respects `top_sessions`.

- [ ] **Step 2: Run the MCP test and verify red**

Run: `npm test -- test/server.test.ts`

Expected: failure because `createTokenGuardianServer` does not exist.

- [ ] **Step 3: Register both tools with strict schemas**

Use `McpServer.registerTool`, Zod 4 input and output schemas, concise descriptions, `structuredContent`, and serialized JSON text for compatibility. Return actionable tool errors with `isError: true`.

- [ ] **Step 4: Add the stdio entry point**

Connect `StdioServerTransport` without writing protocol noise to stdout. Fatal startup messages go to stderr.

- [ ] **Step 5: Run the MCP test and verify green**

Run: `npm test -- test/server.test.ts`

Expected: the client lists and calls both tools successfully.

### Task 4: Documentation, evaluations, and full verification

**Files:**
- Create: `README.md`
- Create: `evaluation.xml`
- Create: `.gitignore`

**Interfaces:**
- Consumes: the built `dist/index.js` stdio server.
- Produces: local operating instructions and stable routing-policy evaluation questions.

- [ ] **Step 1: Document the safety boundary and tools**

State prominently that the server does not change settings or switch models. Include exact local build and inspector commands. Put registration steps in a clearly separated future section and do not perform them.

- [ ] **Step 2: Add ten stable evaluation questions**

Use fixed routing-policy inputs with single verifiable model or effort answers. Do not use changing live-usage totals as expected answers.

- [ ] **Step 3: Run complete verification**

Run:

```text
npm test
npm run typecheck
npm run build
```

Expected: zero failed tests, zero type errors, and `dist/index.js` exists.

- [ ] **Step 4: Run one live read-only snapshot**

Call the built server through an MCP client with `days=2` and `top_sessions=10`. Confirm it calls `ccusage` offline, returns both agents, and changes no tracked or configuration files.

- [ ] **Step 5: Review the diff and stop before registration**

Confirm no secrets, URLs, API keys, configuration writes, model calls, or process-control code are present. Registration remains a separate authorized step.
