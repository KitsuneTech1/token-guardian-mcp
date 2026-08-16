import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDryRun,
  formatDryRun,
  parseRouteTaskArgs,
} from "../src/route-cli.js";

const temporaryDirectories: string[] = [];

async function emptyTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "token-guardian-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("route-task dry run", () => {
  it("prints a Codex session command but never executes it", async () => {
    const result = await buildDryRun({
      client: "codex",
      prompt: "Implement a bounded CSV parser with unit tests.",
      cwd: await emptyTemporaryDirectory(),
    });

    expect(result.recommendation.model).toBe("gpt-5.6-terra");
    expect(result.recommendation.effort).toBe("medium");
    expect(result.willExecute).toBe(false);
    expect(result.launchCommand).toContain("codex -m gpt-5.6-terra");
    expect(formatDryRun(result)).toContain("Dry run only. Nothing was launched or changed.");
  });

  it("quotes apostrophes in a PowerShell-safe Claude launch command", async () => {
    const result = await buildDryRun({
      client: "claude",
      prompt: "Research Claude's current hook behavior.",
      cwd: await emptyTemporaryDirectory(),
    });

    expect(result.launchCommand).toContain("'Research Claude''s current hook behavior.'");
    expect(result.launchCommand).toContain("claude --model sonnet --effort high");
  });

  it("parses explicit dry-run arguments", () => {
    expect(
      parseRouteTaskArgs([
        "--client",
        "codex",
        "--prompt",
        "Fix the parser bug",
        "--cwd",
        "C:\\work",
        "--json",
      ]),
    ).toEqual({
      client: "codex",
      prompt: "Fix the parser bug",
      cwd: "C:\\work",
      json: true,
    });
  });

  it("rejects a missing prompt before doing any analysis", () => {
    expect(() => parseRouteTaskArgs(["--client", "codex"])).toThrow(
      "--prompt is required",
    );
  });
});
