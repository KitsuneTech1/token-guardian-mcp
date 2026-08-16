import type {
  ClientName,
  RiskLevel,
  RouteRecommendation,
  RouteTier,
  TaskKind,
  ValidatorRoute,
} from "./types.js";
import type { RouteRequest } from "./types.js";

const FRONTIER_KINDS = new Set<TaskKind>([
  "architecture",
  "security",
  "production",
  "destructive",
]);

const BALANCED_KINDS = new Set<TaskKind>([
  "coding",
  "testing",
  "debugging",
  "research",
]);

interface RouteTarget {
  model: string;
  effort: string;
}
const ROUTES: Record<ClientName, Record<RouteTier, RouteTarget>> = {
  codex: {
    cheapest: { model: "gpt-5.6-luna", effort: "low" },
    balanced: { model: "gpt-5.6-terra", effort: "medium" },
    frontier: { model: "gpt-5.6-sol", effort: "high" },
  },
  claude: {
    cheapest: { model: "haiku", effort: "low" },
    balanced: { model: "sonnet", effort: "high" },
    frontier: { model: "opus", effort: "high" },
  },
  local: {
    cheapest: { model: "configured-local-model", effort: "low" },
    balanced: { model: "configured-local-model", effort: "medium" },
    frontier: { model: "hosted-frontier-model", effort: "high" },
  },
};

function chooseTier(taskKind: TaskKind | undefined, risk: RiskLevel): RouteTier {
  if (risk === "critical" || risk === "high") {
    return "frontier";
  }

  if (taskKind === undefined || FRONTIER_KINDS.has(taskKind)) {
    return "frontier";
  }

  if (BALANCED_KINDS.has(taskKind) && risk === "normal") {
    return "balanced";
  }

  if (taskKind === "writing" && risk === "normal") {
    return "balanced";
  }

  return "cheapest";
}

function frontierValidator(client: ClientName): ValidatorRoute {
  if (client === "codex") {
    return { model: "gpt-5.6-sol", effort: "high" };
  }
  if (client === "claude") {
    return { model: "opus", effort: "high" };
  }
  return { model: "hosted-frontier-model", effort: "high" };
}

function reasonForTier(tier: RouteTier, taskKind: TaskKind | undefined, risk: RiskLevel): string {
  if (taskKind === undefined) {
    return "The task shape is ambiguous, so the recommendation fails closed to frontier capability.";
  }
  if (risk === "critical" || risk === "high") {
    return `The declared ${risk} risk requires frontier judgment.`;
  }
  if (tier === "frontier") {
    return `${taskKind} work can create broad or costly consequences.`;
  }
  if (tier === "balanced") {
    return `${taskKind} work benefits from solid reasoning without paying frontier cost on every step.`;
  }
  return `${taskKind} work is bounded enough for the cheapest capable route.`;
}

export function recommendRoute(request: RouteRequest): RouteRecommendation {
  const risk = request.risk ?? "normal";
  const tier = chooseTier(request.taskKind, risk);
  const target = ROUTES[request.client][tier];
  const actions: string[] = [];

  if ((request.contextTokens ?? 0) > 180_000) {
    actions.push("Start a milestone handoff before continuing.");
  }

  const recommendation: RouteRecommendation = {
    client: request.client,
    model: target.model,
    effort:
      tier === "frontier" && (risk === "high" || risk === "critical")
        ? "xhigh"
        : target.effort,
    tier,
    confidence: request.taskKind === undefined ? "low" : "high",
    reasons: [reasonForTier(tier, request.taskKind, risk)],
    actions,
    advisoryOnly: true,
  };

  if (tier === "balanced" && risk === "normal") {
    recommendation.validator = frontierValidator(request.client);
    recommendation.reasons.push(
      "Use the frontier validator for the final review instead of paying frontier cost throughout.",
    );
  }

  if (request.currentModel === recommendation.model && request.currentEffort === recommendation.effort) {
    recommendation.actions.push("Keep the current route.");
  }

  return recommendation;
}
