import type {
  AgentBreakdown,
  CcusageReport,
  CodexThreadMetadata,
  ModelBreakdown,
  SessionUsageRow,
  TokenTotals,
} from "./usage.js";

export type UsageAgent = "all" | "claude" | "codex";

export interface AnalyzeUsageOptions {
  agent: UsageAgent;
  days: number;
  topSessions: number;
  threadMetadata: ReadonlyMap<string, CodexThreadMetadata>;
}

export interface UsageFinding {
  code:
    | "cache_already_strong"
    | "oversized_session"
    | "frontier_everywhere"
    | "duplicate_work"
    | "context_replay_dominates";
  priority: "high" | "medium" | "low";
  evidence: string;
  action: string;
  risk: "none" | "low";
  autoApply: false;
}

export interface UsageSessionSummary {
  id: string;
  agent: string;
  title?: string;
  totalTokens: number;
  models: string[];
  lastActivity?: string;
  reasoningOutputTokens?: number;
  configuredModel?: string;
  configuredEffort?: string;
}

export interface DuplicateCodexWork {
  title: string;
  sessionCount: number;
  totalTokens: number;
  sessionIds: string[];
}

export interface UsageSnapshot {
  window: { days: number; agent: UsageAgent };
  totals: TokenTotals;
  byAgent: Record<string, TokenTotals>;
  byModel: Array<{ model: string; totalTokens: number }>;
  metrics: {
    cacheReadShare: number;
    outputShare: number;
    frontierShare: number;
  };
  topSessions: UsageSessionSummary[];
  duplicateCodexWork: DuplicateCodexWork[];
  quickWins: UsageFinding[];
  caveat: string;
}

const ZERO_TOTALS: TokenTotals = {
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

function addTotals(left: TokenTotals, right: TokenTotals): TokenTotals {
  return {
    cacheCreationTokens: left.cacheCreationTokens + right.cacheCreationTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function tokenTotalForModel(model: ModelBreakdown): number {
  return (
    model.cacheCreationTokens +
    model.cacheReadTokens +
    model.inputTokens +
    model.outputTokens
  );
}

function isFrontierModel(modelName: string): boolean {
  const normalized = modelName.toLowerCase();
  return (
    normalized.includes("gpt-5.6-sol") ||
    normalized.includes("gpt-daybreak") ||
    normalized.includes("gpt-5.5") ||
    normalized.includes("opus") ||
    normalized.includes("fable")
  );
}

function selectedAgentRows(report: CcusageReport, agent: UsageAgent): AgentBreakdown[] {
  if (agent === "all") {
    return report.daily.flatMap((day) => day.agents ?? []);
  }
  return report.daily.flatMap((day) =>
    (day.agents ?? []).filter((entry) => entry.agent === agent),
  );
}

function selectedTotals(report: CcusageReport, agent: UsageAgent): TokenTotals {
  if (agent === "all") {
    return report.totals;
  }
  return selectedAgentRows(report, agent).reduce<TokenTotals>(addTotals, ZERO_TOTALS);
}

function sessionId(session: SessionUsageRow): string {
  const match = session.period.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match?.[1] ?? session.period;
}

function metadataForSession(
  session: SessionUsageRow,
  metadata: ReadonlyMap<string, CodexThreadMetadata>,
): [string, CodexThreadMetadata | undefined] {
  const extracted = sessionId(session);
  const direct = metadata.get(extracted);
  if (direct !== undefined) {
    return [extracted, direct];
  }
  for (const [id, entry] of metadata) {
    if (session.period.endsWith(id)) {
      return [id, entry];
    }
  }
  return [extracted, undefined];
}

function summarizeSession(
  session: SessionUsageRow,
  metadata: ReadonlyMap<string, CodexThreadMetadata>,
): UsageSessionSummary {
  const [id, thread] = metadataForSession(session, metadata);
  return {
    id,
    agent: session.agent,
    totalTokens: session.totalTokens,
    models: session.modelsUsed,
    ...(thread?.title ? { title: thread.title } : {}),
    ...(session.metadata?.lastActivity ? { lastActivity: session.metadata.lastActivity } : {}),
    ...(session.metadata?.reasoningOutputTokens !== undefined
      ? { reasoningOutputTokens: session.metadata.reasoningOutputTokens }
      : {}),
    ...(thread?.model ? { configuredModel: thread.model } : {}),
    ...(thread?.reasoningEffort ? { configuredEffort: thread.reasoningEffort } : {}),
  };
}

function findDuplicateCodexWork(sessions: UsageSessionSummary[]): DuplicateCodexWork[] {
  const groups = new Map<string, UsageSessionSummary[]>();
  for (const session of sessions) {
    if (session.agent !== "codex" || session.title === undefined) {
      continue;
    }
    const key = session.title.trim().replace(/\s+/g, " ").toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      title: group[0]?.title ?? "",
      sessionCount: group.length,
      totalTokens: group.reduce((sum, session) => sum + session.totalTokens, 0),
      sessionIds: group.map((session) => session.id),
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function titlePreview(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
}

function capSessionTitle(session: UsageSessionSummary): UsageSessionSummary {
  return session.title === undefined ? session : { ...session, title: titlePreview(session.title) };
}

export function analyzeUsage(
  report: CcusageReport,
  options: AnalyzeUsageOptions,
): UsageSnapshot {
  const totals = selectedTotals(report, options.agent);
  const agentRows = selectedAgentRows(report, options.agent);
  const byAgent: Record<string, TokenTotals> = {};
  const modelTotals = new Map<string, number>();

  for (const row of agentRows) {
    byAgent[row.agent] = addTotals(byAgent[row.agent] ?? ZERO_TOTALS, row);
    for (const model of row.modelBreakdowns) {
      modelTotals.set(model.modelName, (modelTotals.get(model.modelName) ?? 0) + tokenTotalForModel(model));
    }
  }

  const selectedSessions = report.session
    .filter((session) => options.agent === "all" || session.agent === options.agent)
    .map((session) => summarizeSession(session, options.threadMetadata));
  const topSessions = [...selectedSessions]
    .sort((left, right) => right.totalTokens - left.totalTokens)
    .slice(0, options.topSessions)
    .map(capSessionTitle);
  const duplicateCodexWork = findDuplicateCodexWork(selectedSessions).map((duplicate) => ({
    ...duplicate,
    title: titlePreview(duplicate.title),
  }));
  const cacheReadShare = ratio(totals.cacheReadTokens, totals.totalTokens);
  const outputShare = ratio(totals.outputTokens, totals.totalTokens);
  const frontierTokens = [...modelTotals.entries()]
    .filter(([model]) => isFrontierModel(model))
    .reduce((sum, [, tokens]) => sum + tokens, 0);
  const frontierShare = ratio(frontierTokens, totals.totalTokens);
  const quickWins: UsageFinding[] = [];

  if (cacheReadShare > 0.9) {
    quickWins.push({
      code: "cache_already_strong",
      priority: "low",
      evidence: `${(cacheReadShare * 100).toFixed(1)}% of processed tokens were cache reads.`,
      action: "Keep caching intact. Focus on repeated long-context replay and task routing instead.",
      risk: "none",
      autoApply: false,
    });
  }

  const oversized = topSessions.filter((session) => session.totalTokens > 25_000_000);
  if (oversized.length > 0) {
    const largest = oversized[0]?.totalTokens ?? 0;
    quickWins.push({
      code: "oversized_session",
      priority: largest > 50_000_000 ? "high" : "medium",
      evidence: `${oversized.length} session(s) exceeded 25 million processed tokens; the largest used ${largest.toLocaleString("en-US")}.`,
      action: "Create a milestone handoff and continue in a fresh session after the current safe stopping point.",
      risk: "low",
      autoApply: false,
    });
  }

  if (frontierShare > 0.8) {
    quickWins.push({
      code: "frontier_everywhere",
      priority: "high",
      evidence: `${(frontierShare * 100).toFixed(1)}% of processed tokens used frontier models.`,
      action: "Route mechanical work to the cheapest tier and bounded coding to the balanced tier, with frontier validation at completion.",
      risk: "low",
      autoApply: false,
    });
  }

  if (duplicateCodexWork.length > 0) {
    quickWins.push({
      code: "duplicate_work",
      priority: "high",
      evidence: `${duplicateCodexWork.length} exact-title Codex workstream(s) appeared more than once.`,
      action: "Keep one top-level session per task and close or hand off exact duplicates.",
      risk: "low",
      autoApply: false,
    });
  }

  if (totals.cacheReadTokens > totals.outputTokens * 20 && totals.cacheReadTokens > 0) {
    quickWins.push({
      code: "context_replay_dominates",
      priority: "high",
      evidence: `Cache reads were ${ratio(totals.cacheReadTokens, Math.max(1, totals.outputTokens)).toFixed(1)} times output tokens.`,
      action: "Shorten future task histories through milestone handoffs instead of reducing answer quality.",
      risk: "low",
      autoApply: false,
    });
  }

  return {
    window: { days: options.days, agent: options.agent },
    totals,
    byAgent,
    byModel: [...modelTotals.entries()]
      .map(([model, totalTokens]) => ({ model, totalTokens }))
      .sort((left, right) => right.totalTokens - left.totalTokens),
    metrics: { cacheReadShare, outputShare, frontierShare },
    topSessions,
    duplicateCodexWork,
    quickWins,
    caveat:
      "Processed-token totals are diagnostic workload measures. They are not the same as subscription-meter usage, especially when cached input dominates.",
  };
}
