import { describe, expect, it } from "vitest";

import { analyzeUsage } from "../src/analysis.js";
import type { CcusageReport } from "../src/usage.js";

const report: CcusageReport = {
  daily: [
    {
      agent: "all",
      period: "2026-08-16",
      cacheCreationTokens: 0,
      cacheReadTokens: 95_000_000,
      inputTokens: 3_000_000,
      outputTokens: 2_000_000,
      totalTokens: 100_000_000,
      modelsUsed: ["gpt-5.6-sol"],
      modelBreakdowns: [
        {
          modelName: "gpt-5.6-sol",
          cacheCreationTokens: 0,
          cacheReadTokens: 95_000_000,
          inputTokens: 3_000_000,
          outputTokens: 2_000_000,
        },
      ],
      agents: [
        {
          agent: "codex",
          cacheCreationTokens: 0,
          cacheReadTokens: 95_000_000,
          inputTokens: 3_000_000,
          outputTokens: 2_000_000,
          totalTokens: 100_000_000,
          modelsUsed: ["gpt-5.6-sol"],
          modelBreakdowns: [
            {
              modelName: "gpt-5.6-sol",
              cacheCreationTokens: 0,
              cacheReadTokens: 95_000_000,
              inputTokens: 3_000_000,
              outputTokens: 2_000_000,
            },
          ],
        },
      ],
    },
  ],
  session: [
    {
      agent: "codex",
      period: "2026/08/16/rollout-2026-08-16T00-00-00-thread-one",
      cacheCreationTokens: 0,
      cacheReadTokens: 58_000_000,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 60_000_000,
      modelsUsed: ["gpt-5.6-sol"],
      modelBreakdowns: [],
      metadata: { lastActivity: "2026-08-16T12:00:00.000Z", reasoningOutputTokens: 500_000 },
    },
    {
      agent: "codex",
      period: "2026/08/16/rollout-2026-08-16T01-00-00-thread-two",
      cacheCreationTokens: 0,
      cacheReadTokens: 19_000_000,
      inputTokens: 500_000,
      outputTokens: 500_000,
      totalTokens: 20_000_000,
      modelsUsed: ["gpt-5.6-sol"],
      modelBreakdowns: [],
      metadata: { lastActivity: "2026-08-16T13:00:00.000Z", reasoningOutputTokens: 100_000 },
    },
  ],
  totals: {
    cacheCreationTokens: 0,
    cacheReadTokens: 95_000_000,
    inputTokens: 3_000_000,
    outputTokens: 2_000_000,
    totalTokens: 100_000_000,
  },
};

describe("analyzeUsage", () => {
  it("finds strong caching, oversized sessions, and frontier concentration", () => {
    const snapshot = analyzeUsage(report, {
      agent: "all",
      days: 2,
      topSessions: 10,
      threadMetadata: new Map([
        ["thread-one", { title: "Same bounded task", model: "gpt-5.6-sol", reasoningEffort: "high" }],
        ["thread-two", { title: "Same bounded task", model: "gpt-5.6-sol", reasoningEffort: "high" }],
      ]),
    });

    expect(snapshot.metrics.cacheReadShare).toBeCloseTo(0.95);
    expect(snapshot.metrics.frontierShare).toBeCloseTo(1);
    expect(snapshot.quickWins.map((item) => item.code)).toEqual(
      expect.arrayContaining(["cache_already_strong", "oversized_session", "frontier_everywhere", "duplicate_work"]),
    );
    expect(snapshot.topSessions[0]?.title).toBe("Same bounded task");
    expect(snapshot.duplicateCodexWork[0]?.sessionCount).toBe(2);
    expect(snapshot.quickWins.every((item) => item.autoApply === false)).toBe(true);
  });

  it("filters sessions by agent and respects the result limit", () => {
    const snapshot = analyzeUsage(report, {
      agent: "claude",
      days: 2,
      topSessions: 1,
      threadMetadata: new Map(),
    });

    expect(snapshot.topSessions).toHaveLength(0);
    expect(snapshot.window.days).toBe(2);
  });

  it("caps session titles so the diagnostic does not create more context waste", () => {
    const snapshot = analyzeUsage(report, {
      agent: "all",
      days: 2,
      topSessions: 10,
      threadMetadata: new Map([
        [
          "thread-one",
          {
            title: `Very long prompt ${"x".repeat(1_000)}`,
            model: "gpt-5.6-sol",
            reasoningEffort: "high",
          },
        ],
      ]),
    });

    expect(snapshot.topSessions[0]?.title?.length).toBeLessThanOrEqual(160);
    expect(snapshot.topSessions[0]?.title).toMatch(/\.\.\.$/);
  });
});
