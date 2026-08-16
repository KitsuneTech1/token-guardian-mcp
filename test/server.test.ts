import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";

import { createTokenGuardianServer } from "../src/server.js";
import type { CcusageReport } from "../src/usage.js";

const report: CcusageReport = {
  daily: [],
  session: [
    {
      agent: "codex",
      period: "session-one",
      cacheCreationTokens: 0,
      cacheReadTokens: 900,
      inputTokens: 50,
      outputTokens: 50,
      totalTokens: 1_000,
      modelsUsed: ["gpt-5.6-sol"],
      modelBreakdowns: [],
    },
    {
      agent: "claude",
      period: "session-two",
      cacheCreationTokens: 0,
      cacheReadTokens: 450,
      inputTokens: 25,
      outputTokens: 25,
      totalTokens: 500,
      modelsUsed: ["claude-opus-5"],
      modelBreakdowns: [],
    },
  ],
  totals: {
    cacheCreationTokens: 0,
    cacheReadTokens: 1_350,
    inputTokens: 75,
    outputTokens: 75,
    totalTokens: 1_500,
  },
};

describe("Token Guardian MCP server", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map(async (close) => close()));
  });

  async function connect() {
    const server = createTokenGuardianServer({
      loadUsageReport: async () => report,
      loadThreadMetadata: () => new Map(),
    });
    const client = new Client({ name: "token-guardian-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(async () => {
      await client.close();
      await server.close();
    });
    return client;
  }

  it("lists two deterministic read-only tools", async () => {
    const client = await connect();
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "token_guardian_usage_snapshot",
      "token_guardian_recommend_route",
    ]);
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it("returns a structured conservative route", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "token_guardian_recommend_route",
      arguments: {
        client: "codex",
        task_summary: "Implement bounded unit tests.",
        task_kind: "testing",
        risk: "normal",
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      model: "gpt-5.6-terra",
      effort: "medium",
      advisoryOnly: true,
    });
  });

  it("respects the usage session limit", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "token_guardian_usage_snapshot",
      arguments: { days: 2, top_sessions: 1, agent: "all" },
    });
    const structured = result.structuredContent as { topSessions?: unknown[] } | undefined;

    expect(result.isError).not.toBe(true);
    expect(structured?.topSessions).toHaveLength(1);
  });
});
