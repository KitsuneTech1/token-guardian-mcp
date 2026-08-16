export type ClientName = "claude" | "codex" | "local";

export type TaskKind =
  | "mechanical"
  | "research"
  | "writing"
  | "coding"
  | "testing"
  | "debugging"
  | "architecture"
  | "security"
  | "production"
  | "destructive";

export type RiskLevel = "low" | "normal" | "high" | "critical";
export type RouteTier = "cheapest" | "balanced" | "frontier";
export type RouteConfidence = "low" | "medium" | "high";

export interface RouteRequest {
  client: ClientName;
  taskSummary: string;
  taskKind?: TaskKind;
  risk?: RiskLevel;
  contextTokens?: number;
  currentModel?: string;
  currentEffort?: string;
}
export interface ValidatorRoute {
  model: string;
  effort: string;
}

export interface RouteRecommendation {
  client: ClientName;
  model: string;
  effort: string;
  tier: RouteTier;
  confidence: RouteConfidence;
  reasons: string[];
  actions: string[];
  validator?: ValidatorRoute;
  advisoryOnly: true;
}
