# Prompt-First Route Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only dry-run command that classifies a first prompt and recommends a model before a paid Claude or Codex turn, even when the working folder is not a repository.

**Architecture:** A focused preflight module will infer task kind and risk from the prompt, then inspect only bounded directory-entry names for optional workspace evidence. It will pass that result to the existing conservative routing function. A separate CLI formatter will print the recommendation and a session-scoped launch command without executing it.

**Tech Stack:** TypeScript 7, Node.js 24, Vitest 4, existing Token Guardian routing core.

## Global Constraints

- Do not register an MCP server or edit Claude or Codex configuration.
- Do not launch a model, alter a running session, read file contents, or require Git.
- Treat repository and project markers as optional evidence.
- Fail closed to the frontier route when the prompt is materially ambiguous or risky.
- Keep all output free of em dashes, en dashes, smart quotes, and banned filler.

---

### Task 1: Prompt and workspace analysis

**Files:**
- Create: `src/preflight.ts`
- Create: `test/preflight.test.ts`

**Interfaces:**
- Produces: `analyzePreflight(input: PreflightInput): Promise<PreflightAnalysis>`
- Produces: `PreflightAnalysis` with `taskKind`, `risk`, `confidence`, `workspace`, and `evidence`.

- [ ] **Step 1: Write failing tests**

Add table-driven cases proving that bounded coding routes to `coding`, research routes to `research`, risky production work routes to `production` or `destructive`, ambiguous prompts remain unclassified, and an empty temporary folder works without Git.

- [ ] **Step 2: Verify the tests fail for the missing module**

Run: `npm test -- test/preflight.test.ts`

Expected: FAIL because `src/preflight.ts` does not exist.

- [ ] **Step 3: Implement the minimal analyzer**

Implement prompt scoring with explicit high-risk precedence. Inspect at most the current directory entry names using `readdir`, recognize `.git` and common project markers, and never open file contents.

- [ ] **Step 4: Verify the focused tests pass**

Run: `npm test -- test/preflight.test.ts`

Expected: all preflight tests pass.

### Task 2: Read-only dry-run CLI

**Files:**
- Create: `src/route-cli.ts`
- Create: `test/route-cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `analyzePreflight()` and `recommendRoute()`.
- Produces: `buildDryRun(input: DryRunInput): Promise<DryRunResult>` and the `route-task` executable.

- [ ] **Step 1: Write failing tests**

Test Codex and Claude output, PowerShell-safe prompt quoting, JSON output, missing prompt errors, and confirmation that no child process is launched.

- [ ] **Step 2: Verify the CLI tests fail**

Run: `npm test -- test/route-cli.test.ts`

Expected: FAIL because `src/route-cli.ts` does not exist.

- [ ] **Step 3: Implement the minimal CLI**

Accept `--client`, `--prompt`, optional `--cwd`, and `--json`. Print the inferred task, confidence, evidence, recommendation, and a quoted launch command. Do not execute the command.

- [ ] **Step 4: Verify the focused CLI tests pass**

Run: `npm test -- test/route-cli.test.ts`

Expected: all CLI tests pass.

### Task 3: Calibration, documentation, and verification

**Files:**
- Create: `test/calibration.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `buildDryRun()`.
- Produces: a stable calibration suite and one documented dry-run command.

- [ ] **Step 1: Add failing calibration cases before tuning**

Cover mechanical work, ordinary research, loose-folder coding, debugging, architecture, security, production, destructive work, and vague prompts. Expected tiers must never under-route risky or ambiguous work.

- [ ] **Step 2: Run the calibration suite and capture any misses**

Run: `npm test -- test/calibration.test.ts`

Expected: FAIL until classification thresholds cover the approved cases.

- [ ] **Step 3: Make the smallest threshold corrections**

Change only explicit prompt signals or precedence needed by a failing case. Do not add an LLM call or recursive file scan.

- [ ] **Step 4: Document the dry-run boundary and command**

Document that `route-task` works from non-repository folders and only prints advice.

- [ ] **Step 5: Run complete verification**

Run: `npm test`, `npm run typecheck`, `npm run build`, then one real `node dist/route-cli.js` dry run from the repository root.

Expected: all tests pass, typecheck and build exit 0, and the live dry run prints a recommendation without changing configuration.

- [ ] **Step 6: Review and commit**

Inspect `git diff`, verify Claude and Codex config hashes remain unchanged, scan user-facing text for banned punctuation, and commit only Token Guardian files.
