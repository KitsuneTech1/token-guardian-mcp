#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { analyzePreflight } from "./preflight.js";
import type { PreflightAnalysis } from "./preflight.js";
import { recommendRoute } from "./routing.js";
import type { ClientName, RouteRecommendation } from "./types.js";

export interface DryRunInput {
  client: Exclude<ClientName, "local">;
  prompt: string;
  cwd: string;
}

export interface DryRunResult {
  client: Exclude<ClientName, "local">;
  analysis: PreflightAnalysis;
  recommendation: RouteRecommendation;
  launchCommand: string;
  willExecute: false;
}

export interface RouteTaskArguments extends DryRunInput {
  json: boolean;
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function launchCommandFor(
  client: Exclude<ClientName, "local">,
  recommendation: RouteRecommendation,
  prompt: string,
): string {
  const quotedPrompt = quotePowerShellLiteral(prompt);
  if (client === "claude") {
    return `claude --model ${recommendation.model} --effort ${recommendation.effort} ${quotedPrompt}`;
  }
  const effortOverride = quotePowerShellLiteral(
    `model_reasoning_effort="${recommendation.effort}"`,
  );
  return `codex -m ${recommendation.model} -c ${effortOverride} ${quotedPrompt}`;
}

export async function buildDryRun(input: DryRunInput): Promise<DryRunResult> {
  const analysis = await analyzePreflight({ prompt: input.prompt, cwd: input.cwd });
  const recommendation = recommendRoute({
    client: input.client,
    taskSummary: input.prompt,
    risk: analysis.risk,
    ...(analysis.taskKind !== undefined ? { taskKind: analysis.taskKind } : {}),
  });

  return {
    client: input.client,
    analysis,
    recommendation,
    launchCommand: launchCommandFor(input.client, recommendation, input.prompt),
    willExecute: false,
  };
}

export function formatDryRun(result: DryRunResult): string {
  const task = result.analysis.taskKind ?? "ambiguous";
  const lines = [
    `Recommended route: ${result.recommendation.model} at ${result.recommendation.effort} effort`,
    `Task: ${task} (${result.analysis.confidence} confidence)`,
    `Risk: ${result.analysis.risk}`,
    `Workspace: ${result.analysis.workspace.kind}`,
    "Evidence:",
    ...result.analysis.evidence.map((item) => `- ${item}`),
    "Suggested launch command:",
    result.launchCommand,
    "Dry run only. Nothing was launched or changed.",
  ];
  return lines.join("\n");
}

function nextArgument(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function parseRouteTaskArgs(args: readonly string[]): RouteTaskArguments {
  let client: "claude" | "codex" = "codex";
  let prompt: string | undefined;
  let cwd = process.cwd();
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--client") {
      const value = nextArgument(args, index, flag);
      if (value !== "claude" && value !== "codex") {
        throw new Error("--client must be claude or codex.");
      }
      client = value;
      index += 1;
    } else if (flag === "--prompt") {
      prompt = nextArgument(args, index, flag);
      index += 1;
    } else if (flag === "--cwd") {
      cwd = nextArgument(args, index, flag);
      index += 1;
    } else if (flag === "--json") {
      json = true;
    } else {
      throw new Error(`Unknown argument: ${flag ?? ""}`);
    }
  }

  if (prompt === undefined) {
    throw new Error("--prompt is required.");
  }
  return { client, prompt, cwd, json };
}

export async function runRouteTask(args: readonly string[]): Promise<void> {
  const parsed = parseRouteTaskArgs(args);
  const result = await buildDryRun(parsed);
  process.stdout.write(parsed.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatDryRun(result)}\n`);
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  runRouteTask(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`route-task failed: ${message}`);
    process.exitCode = 1;
  });
}
