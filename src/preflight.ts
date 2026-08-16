import { opendir } from "node:fs/promises";

import type { RiskLevel, RouteConfidence, TaskKind } from "./types.js";

const MAX_DIRECTORY_ENTRIES = 256;

const CONTINUATION_PROMPT =
  /^(?:yeah|yes|yep|okay|ok|sure|go ahead|go (?:check|do|fix|update)|do it|test that|fix that|continue)\b/i;
const HIGH_STAKES_PROMPT =
  /\b(active contract|financial advice|legal advice|medical advice|patient|tax advice)\b/i;
const EMPLOYMENT_PROMPT =
  /\b(apply for jobs|job search|look(?:ing)? for jobs)\b/i;

const PROJECT_MARKERS = new Set([
  "cargo.toml",
  "composer.json",
  "deno.json",
  "deno.jsonc",
  "docker-compose.yml",
  "docker-compose.yaml",
  "flake.nix",
  "gemfile",
  "go.mod",
  "package.json",
  "pom.xml",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "unityproject",
]);

interface TaskRule {
  kind: TaskKind;
  pattern: RegExp;
  evidence: string;
}

const TASK_RULES: readonly TaskRule[] = [
  {
    kind: "destructive",
    pattern: /\b(delete|destroy|drop|erase|purge|reset|wipe|remove all|rm\s+-rf)\b/i,
    evidence: "The prompt includes a destructive operation.",
  },
  {
    kind: "security",
    pattern:
      /\b(auth(?:entication|orization)?|credential|exploit|malware|permission|pentest|planned action|secret|security|untrusted agent|vulnerabilit(?:y|ies))\b/i,
    evidence: "The prompt includes a security boundary or vulnerability check.",
  },
  {
    kind: "production",
    pattern: /\b(deploy|live service|production|prod environment|release to|shared infrastructure)\b/i,
    evidence: "The prompt can affect a live or production system.",
  },
  {
    kind: "architecture",
    pattern:
      /\b(advanced|application system|architect(?:ure|ural)?|complete compiler|control plane|design the system|discord bot alerts?|discord bot.{0,40}emails?|emails?.{0,40}discord bot|entire codebase|from scratch|large-scale|mcp|multi-service|operating system|rewrite|system design)\b/i,
    evidence: "The prompt asks for broad system design or architecture work.",
  },
  {
    kind: "debugging",
    pattern: /\b(bug|diagnos(?:e|is)|error|fail(?:ed|ing)?|fix|root cause|troubleshoot)\b/i,
    evidence: "The prompt asks to diagnose or fix a failure.",
  },
  {
    kind: "research",
    pattern:
      /\b(check (?:my |the )?(?:to-do|todo)|compare|find out|investigate|look into|look up|obsidian|research|verify current)\b/i,
    evidence: "The prompt asks for research or current-state verification.",
  },
  {
    kind: "coding",
    pattern:
      /\b(add|build|code|create|implement|integrate|parser|refactor|script|typescript|website)\b/i,
    evidence: "The prompt asks for bounded implementation work.",
  },
  {
    kind: "testing",
    pattern: /\b(benchmark|coverage|test|tests|testing|validate)\b/i,
    evidence: "The prompt asks for testing or validation work.",
  },
  {
    kind: "writing",
    pattern:
      /\b(documentation|draft (?:an )?email|proposal|readme|resume|write (?:an )?email|write copy|write-up)\b/i,
    evidence: "The prompt asks for writing work.",
  },
  {
    kind: "mechanical",
    pattern: /\b(extract|format|normalize|rename|sort|transcribe)\b/i,
    evidence: "The prompt describes a bounded mechanical transformation.",
  },
];

export type WorkspaceKind = "git" | "project" | "loose" | "unavailable";

export interface WorkspaceEvidence {
  kind: WorkspaceKind;
  markers: string[];
  inspectedEntries: number;
  capped: boolean;
}

export interface PreflightInput {
  prompt: string;
  cwd: string;
}

export interface PreflightAnalysis {
  taskKind?: TaskKind;
  risk: RiskLevel;
  confidence: RouteConfidence;
  workspace: WorkspaceEvidence;
  evidence: string[];
}

async function inspectWorkspace(cwd: string): Promise<WorkspaceEvidence> {
  const markers: string[] = [];
  let inspectedEntries = 0;
  let capped = false;

  try {
    const directory = await opendir(cwd);
    try {
      for await (const entry of directory) {
        if (inspectedEntries >= MAX_DIRECTORY_ENTRIES) {
          capped = true;
          break;
        }
        inspectedEntries += 1;
        const normalized = entry.name.toLowerCase();
        if (normalized === ".git" || PROJECT_MARKERS.has(normalized)) {
          markers.push(entry.name);
        }
      }
    } finally {
      await directory.close().catch(() => undefined);
    }
  } catch {
    return { kind: "unavailable", markers: [], inspectedEntries: 0, capped: false };
  }

  markers.sort((left, right) => left.localeCompare(right));
  const normalizedMarkers = new Set(markers.map((marker) => marker.toLowerCase()));
  const kind: WorkspaceKind = normalizedMarkers.has(".git")
    ? "git"
    : markers.length > 0
      ? "project"
      : "loose";

  return { kind, markers, inspectedEntries, capped };
}

function riskFor(kind: TaskKind | undefined, prompt: string): RiskLevel {
  const productionSignal = /\b(live|prod(?:uction)?|shared infrastructure)\b/i.test(prompt);
  if (kind === "destructive" && productionSignal) {
    return "critical";
  }
  if (kind === "destructive" || kind === "security" || kind === "production") {
    return "high";
  }
  if (HIGH_STAKES_PROMPT.test(prompt) || EMPLOYMENT_PROMPT.test(prompt)) {
    return "high";
  }
  if (kind === "mechanical") {
    return "low";
  }
  return "normal";
}

export async function analyzePreflight(input: PreflightInput): Promise<PreflightAnalysis> {
  const prompt = input.prompt.trim();
  if (prompt.length === 0) {
    throw new Error("Prompt cannot be empty.");
  }
  if (prompt.length > 20_000) {
    throw new Error("Prompt exceeds the 20,000 character dry-run limit.");
  }

  const continuationWithoutContext =
    CONTINUATION_PROMPT.test(prompt) && prompt.split(/\s+/).length <= 16;
  const rule = continuationWithoutContext
    ? undefined
    : TASK_RULES.find((candidate) => candidate.pattern.test(prompt));
  const workspace = await inspectWorkspace(input.cwd);
  const evidence = [
    continuationWithoutContext
      ? "The prompt depends on missing prior context, so it cannot be routed downward safely."
      : rule?.evidence ?? "The prompt does not contain enough task-shape evidence to route downward.",
    ...(HIGH_STAKES_PROMPT.test(prompt)
      ? ["The prompt includes a high-stakes legal, medical, or financial decision."]
      : []),
    ...(EMPLOYMENT_PROMPT.test(prompt)
      ? ["The prompt involves a consequential employment decision."]
      : []),
    workspace.kind === "loose"
      ? "No repository or project marker was found. Prompt-first routing is still available."
      : workspace.kind === "unavailable"
        ? "The working folder could not be inspected, so the route uses the prompt only."
        : `Optional workspace markers found: ${workspace.markers.join(", ")}.`,
  ];

  return {
    ...(rule !== undefined ? { taskKind: rule.kind } : {}),
    risk: riskFor(rule?.kind, prompt),
    confidence: rule === undefined ? "low" : "high",
    workspace,
    evidence,
  };
}
