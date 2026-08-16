import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { analyzeUsage } from "./analysis.js";
import type { UsageAgent } from "./analysis.js";
import { recommendRoute } from "./routing.js";
import type { ClientName, RiskLevel, TaskKind } from "./types.js";
import {
  defaultCodexDatabasePath,
  loadUsage,
  readCodexThreadMetadata,
} from "./usage.js";
import type { CcusageReport, CodexThreadMetadata, LoadUsageOptions } from "./usage.js";

const ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const RouteInputSchema = z
  .object({
    client: z.enum(["claude", "codex", "local"]).describe("Client that will perform the task."),
    task_summary: z.string().min(1).max(2_000).describe("Short description of the actual work."),
    task_kind: z
      .enum([
        "mechanical",
        "research",
        "writing",
        "coding",
        "testing",
        "debugging",
        "architecture",
        "security",
        "production",
        "destructive",
      ])
      .optional()
      .describe("Explicit task class. Omit only when genuinely unknown."),
    risk: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    context_tokens: z.number().int().nonnegative().optional(),
    current_model: z.string().min(1).max(200).optional(),
    current_effort: z.string().min(1).max(50).optional(),
  })
  .strict();

const ValidatorSchema = z.object({ model: z.string(), effort: z.string() });

const RouteOutputSchema = z.object({
  client: z.enum(["claude", "codex", "local"]),
  model: z.string(),
  effort: z.string(),
  tier: z.enum(["cheapest", "balanced", "frontier"]),
  confidence: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string()),
  actions: z.array(z.string()),
  validator: ValidatorSchema.optional(),
  advisoryOnly: z.literal(true),
});

const UsageInputSchema = z
  .object({
    days: z.number().int().min(1).max(30).default(7),
    top_sessions: z.number().int().min(1).max(20).default(10),
    agent: z.enum(["all", "claude", "codex"]).default("all"),
  })
  .strict();

const TotalsSchema = z.object({
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});

const UsageOutputSchema = z.object({
  window: z.object({ days: z.number(), agent: z.enum(["all", "claude", "codex"]) }),
  totals: TotalsSchema,
  byAgent: z.record(z.string(), TotalsSchema),
  byModel: z.array(z.object({ model: z.string(), totalTokens: z.number() })),
  metrics: z.object({
    cacheReadShare: z.number(),
    outputShare: z.number(),
    frontierShare: z.number(),
  }),
  topSessions: z.array(
    z.object({
      id: z.string(),
      agent: z.string(),
      title: z.string().optional(),
      totalTokens: z.number(),
      models: z.array(z.string()),
      lastActivity: z.string().optional(),
      reasoningOutputTokens: z.number().optional(),
      configuredModel: z.string().optional(),
      configuredEffort: z.string().optional(),
    }),
  ),
  duplicateCodexWork: z.array(
    z.object({
      title: z.string(),
      sessionCount: z.number(),
      totalTokens: z.number(),
      sessionIds: z.array(z.string()),
    }),
  ),
  quickWins: z.array(
    z.object({
      code: z.enum([
        "cache_already_strong",
        "oversized_session",
        "frontier_everywhere",
        "duplicate_work",
        "context_replay_dominates",
      ]),
      priority: z.enum(["high", "medium", "low"]),
      evidence: z.string(),
      action: z.string(),
      risk: z.enum(["none", "low"]),
      autoApply: z.literal(false),
    }),
  ),
  caveat: z.string(),
});

export interface TokenGuardianDependencies {
  loadUsageReport?: (options: LoadUsageOptions) => Promise<CcusageReport>;
  loadThreadMetadata?: (threadIds: readonly string[]) => Map<string, CodexThreadMetadata>;
}
function threadIds(report: CcusageReport): string[] {
  return report.session.flatMap((session) => {
    if (session.agent !== "codex") {
      return [];
    }
    const match = session.period.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    );
    return match?.[1] ? [match[1]] : [];
  });
}

function defaultThreadLoader(ids: readonly string[]): Map<string, CodexThreadMetadata> {
  const databasePath = defaultCodexDatabasePath();
  if (databasePath === undefined || ids.length === 0) {
    return new Map();
  }
  return readCodexThreadMetadata(databasePath, ids);
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Token Guardian could not complete the read-only check: ${message}` }],
  };
}

export function createTokenGuardianServer(
  dependencies: TokenGuardianDependencies = {},
): McpServer {
  const server = new McpServer({ name: "token-guardian-mcp-server", version: "0.1.0" });
  const loadUsageReport = dependencies.loadUsageReport ?? loadUsage;
  const loadThreadMetadata = dependencies.loadThreadMetadata ?? defaultThreadLoader;

  server.registerTool(
    "token_guardian_usage_snapshot",
    {
      title: "Token Usage Snapshot",
      description:
        "Read local Claude Code and Codex usage, identify large contexts and expensive routing, and return evidence-backed quick wins. Never changes settings or sessions.",
      inputSchema: UsageInputSchema,
      outputSchema: UsageOutputSchema,
      annotations: ToolAnnotations,
    },
    async ({ days, top_sessions, agent }) => {
      try {
        const report = await loadUsageReport({ days });
        const snapshot = analyzeUsage(report, {
          days,
          topSessions: top_sessions,
          agent: agent as UsageAgent,
          threadMetadata: loadThreadMetadata(threadIds(report)),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(snapshot) }],
          structuredContent: snapshot,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "token_guardian_recommend_route",
    {
      title: "Recommend Model Route",
      description:
        "Recommend a conservative Claude, Codex, or local model and effort for one task. Returns advice only and never switches the active client.",
      inputSchema: RouteInputSchema,
      outputSchema: RouteOutputSchema,
      annotations: ToolAnnotations,
    },
    async (input) => {
      try {
        const recommendation = recommendRoute({
          client: input.client as ClientName,
          taskSummary: input.task_summary,
          risk: input.risk as RiskLevel,
          ...(input.task_kind !== undefined ? { taskKind: input.task_kind as TaskKind } : {}),
          ...(input.context_tokens !== undefined ? { contextTokens: input.context_tokens } : {}),
          ...(input.current_model !== undefined ? { currentModel: input.current_model } : {}),
          ...(input.current_effort !== undefined ? { currentEffort: input.current_effort } : {}),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(recommendation) }],
          structuredContent: recommendation,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
