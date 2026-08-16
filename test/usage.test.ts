import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCcusageArgs,
  loadUsage,
  parseCcusageOutput,
  readCodexThreadMetadata,
  UsageDataError,
} from "../src/usage.js";

const minimalReport = JSON.stringify({
  daily: [],
  session: [],
  totals: {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
});

describe("ccusage loading", () => {
  it("always builds offline, no-cost arguments", () => {
    const args = buildCcusageArgs(new Date("2026-08-16T12:00:00.000Z"), 2);

    expect(args).toEqual([
      "--json",
      "--sections",
      "daily,session",
      "--by-agent",
      "--since",
      "2026-08-15",
      "--no-cost",
      "--offline",
    ]);
  });

  it("parses valid ccusage JSON", () => {
    expect(parseCcusageOutput(minimalReport).totals.totalTokens).toBe(0);
  });

  it("returns an actionable error for malformed output", () => {
    expect(() => parseCcusageOutput("not-json")).toThrowError(UsageDataError);
    expect(() => parseCcusageOutput("not-json")).toThrow(/ccusage returned invalid JSON/);
  });

  it("uses the injected runner once and does not retry online", async () => {
    const calls: string[][] = [];
    const result = await loadUsage(
      { days: 2, now: new Date("2026-08-16T12:00:00.000Z") },
      async (_command, args) => {
        calls.push(args);
        return minimalReport;
      },
    );

    expect(result.totals.totalTokens).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("--offline");
  });
});

describe("readCodexThreadMetadata", () => {
  it("opens a Codex database read-only and returns requested thread metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "token-guardian-"));
    const databasePath = join(directory, "state.sqlite");
    execFileSync("sqlite3", [
      databasePath,
      "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, model TEXT, reasoning_effort TEXT); INSERT INTO threads VALUES ('abc', 'A task', 'gpt-5.6-sol', 'high');",
    ]);

    try {
      const metadata = readCodexThreadMetadata(databasePath, ["abc", "missing"]);
      expect(metadata.get("abc")).toEqual({
        title: "A task",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      });
      expect(metadata.has("missing")).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
