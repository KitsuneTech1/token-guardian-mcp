import { describe, expect, it } from "vitest";

import { recommendRoute } from "../src/routing.js";

describe("recommendRoute", () => {
  it("routes low-risk mechanical Codex work to Luna low", () => {
    const result = recommendRoute({
      client: "codex",
      taskSummary: "Extract fields from bounded JSON fixtures.",
      taskKind: "mechanical",
      risk: "low",
    });

    expect(result.model).toBe("gpt-5.6-luna");
    expect(result.effort).toBe("low");
    expect(result.tier).toBe("cheapest");
  });

  it("routes normal bounded Codex coding to Terra medium with Sol validation", () => {
    const result = recommendRoute({
      client: "codex",
      taskSummary: "Implement bounded API tests.",
      taskKind: "coding",
      risk: "normal",
    });

    expect(result.model).toBe("gpt-5.6-terra");
    expect(result.effort).toBe("medium");
    expect(result.validator).toEqual({ model: "gpt-5.6-sol", effort: "high" });
  });

  it("keeps high-risk Claude security work on Opus", () => {
    const result = recommendRoute({
      client: "claude",
      taskSummary: "Review production authentication boundaries.",
      taskKind: "security",
      risk: "high",
    });

    expect(result.model).toBe("opus");
    expect(result.effort).toBe("xhigh");
    expect(result.tier).toBe("frontier");
  });

  it("fails closed to a frontier route when task kind is ambiguous", () => {
    const result = recommendRoute({
      client: "codex",
      taskSummary: "Handle this unclear thing.",
      risk: "normal",
    });

    expect(result.tier).toBe("frontier");
    expect(result.confidence).toBe("low");
  });

  it("recommends a milestone handoff for oversized context", () => {
    const result = recommendRoute({
      client: "codex",
      taskSummary: "Refactor a parser.",
      taskKind: "coding",
      risk: "normal",
      contextTokens: 200_000,
    });

    expect(result.actions).toContain("Start a milestone handoff before continuing.");
  });

  it("keeps critical work on frontier regardless of task kind", () => {
    const result = recommendRoute({
      client: "claude",
      taskSummary: "Format a production credential migration file.",
      taskKind: "mechanical",
      risk: "critical",
    });

    expect(result.model).toBe("opus");
    expect(result.tier).toBe("frontier");
  });

  it("routes low-risk local work locally and names a frontier validator for normal coding", () => {
    const cheap = recommendRoute({
      client: "local",
      taskSummary: "Normalize log rows.",
      taskKind: "mechanical",
      risk: "low",
    });
    const coded = recommendRoute({
      client: "local",
      taskSummary: "Write a bounded parser.",
      taskKind: "coding",
      risk: "normal",
    });

    expect(cheap.model).toBe("configured-local-model");
    expect(coded.validator).toEqual({ model: "hosted-frontier-model", effort: "high" });
  });
});
