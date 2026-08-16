import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

const execFileAsync = promisify(execFile);

const TokenTotalsSchema = z.object({
  cacheCreationTokens: z.number().nonnegative(),
  cacheReadTokens: z.number().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  totalTokens: z.number().nonnegative(),
});

const ModelBreakdownSchema = z.object({
  modelName: z.string(),
  cacheCreationTokens: z.number().nonnegative(),
  cacheReadTokens: z.number().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
});

const AgentBreakdownSchema = TokenTotalsSchema.extend({
  agent: z.string(),
  modelsUsed: z.array(z.string()),
  modelBreakdowns: z.array(ModelBreakdownSchema),
});

const DailyRowSchema = TokenTotalsSchema.extend({
  agent: z.string(),
  period: z.string(),
  modelsUsed: z.array(z.string()),
  modelBreakdowns: z.array(ModelBreakdownSchema),
  agents: z.array(AgentBreakdownSchema).optional(),
});

const SessionRowSchema = TokenTotalsSchema.extend({
  agent: z.string(),
  period: z.string(),
  modelsUsed: z.array(z.string()),
  modelBreakdowns: z.array(ModelBreakdownSchema),
  metadata: z
    .object({
      lastActivity: z.string().optional(),
      reasoningOutputTokens: z.number().nonnegative().optional(),
    })
    .passthrough()
    .optional(),
});

const CcusageReportSchema = z.object({
  daily: z.array(DailyRowSchema),
  session: z.array(SessionRowSchema),
  totals: TokenTotalsSchema,
});

export type TokenTotals = z.infer<typeof TokenTotalsSchema>;
export type ModelBreakdown = z.infer<typeof ModelBreakdownSchema>;
export type AgentBreakdown = z.infer<typeof AgentBreakdownSchema>;
export type DailyUsageRow = z.infer<typeof DailyRowSchema>;
export type SessionUsageRow = z.infer<typeof SessionRowSchema>;
export type CcusageReport = z.infer<typeof CcusageReportSchema>;

export interface CodexThreadMetadata {
  title: string;
  model: string | null;
  reasoningEffort: string | null;
}

export interface LoadUsageOptions {
  days: number;
  now?: Date;
}

export type CommandRunner = (command: string, args: string[]) => Promise<string>;

export class UsageDataError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UsageDataError";
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildCcusageArgs(now: Date, days: number): string[] {
  const since = new Date(now);
  since.setDate(since.getDate() - Math.max(0, days - 1));

  return [
    "--json",
    "--sections",
    "daily,session",
    "--by-agent",
    "--since",
    formatLocalDate(since),
    "--no-cost",
    "--offline",
  ];
}

export function parseCcusageOutput(rawOutput: string): CcusageReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch (error) {
    throw new UsageDataError(
      "ccusage returned invalid JSON. Run `ccusage --version` and verify the local command works.",
      { cause: error },
    );
  }

  const validated = CcusageReportSchema.safeParse(parsed);
  if (!validated.success) {
    throw new UsageDataError(
      `ccusage JSON did not match the expected report shape: ${z.prettifyError(validated.error)}`,
    );
  }
  return validated.data;
}

async function runCcusage(command: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 25 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return result.stdout;
  } catch (error) {
    throw new UsageDataError(
      "Could not run ccusage offline. Verify ccusage is installed and readable from PATH.",
      { cause: error },
    );
  }
}

export async function loadUsage(
  options: LoadUsageOptions,
  runner: CommandRunner = runCcusage,
): Promise<CcusageReport> {
  const args = buildCcusageArgs(options.now ?? new Date(), options.days);
  const rawOutput = await runner("ccusage", args);
  return parseCcusageOutput(rawOutput);
}

export function defaultCodexDatabasePath(): string | undefined {
  const candidate = join(homedir(), ".codex", "state_5.sqlite");
  return existsSync(candidate) ? candidate : undefined;
}

export function readCodexThreadMetadata(
  databasePath: string,
  threadIds: readonly string[],
): Map<string, CodexThreadMetadata> {
  const results = new Map<string, CodexThreadMetadata>();
  const uniqueIds = [...new Set(threadIds)];
  if (uniqueIds.length === 0) {
    return results;
  }

  const quotedIds = uniqueIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(",");
  const query =
    `SELECT id, title, model, reasoning_effort FROM threads ` +
    `WHERE id IN (${quotedIds}) ORDER BY id`;
  const output = execFileSync("sqlite3", ["-readonly", "-json", databasePath, query], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  const rows = z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        model: z.string().nullable(),
        reasoning_effort: z.string().nullable(),
      }),
    )
    .parse(JSON.parse(output || "[]"));

  for (const row of rows) {
    results.set(row.id, {
      title: row.title,
      model: row.model,
      reasoningEffort: row.reasoning_effort,
    });
  }

  return results;
}
