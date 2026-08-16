import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildDryRun } from "../src/route-cli.js";
import type { RouteTier } from "../src/types.js";

let looseFolder: string;

beforeAll(async () => {
  looseFolder = await mkdtemp(join(tmpdir(), "token-guardian-calibration-"));
});

afterAll(async () => {
  await rm(looseFolder, { recursive: true, force: true });
});

describe("prompt-first routing calibration", () => {
  const cases: Array<{ prompt: string; tier: RouteTier }> = [
    { prompt: "Extract the email fields from these ten JSON rows.", tier: "cheapest" },
    { prompt: "Research the current official Codex model flags.", tier: "balanced" },
    { prompt: "Implement a bounded TypeScript log parser.", tier: "balanced" },
    { prompt: "Add a button to the existing settings page.", tier: "balanced" },
    { prompt: "Fix the failing parser test and explain the cause.", tier: "balanced" },
    { prompt: "Draft an email explaining the maintenance window.", tier: "balanced" },
    { prompt: "Design the architecture for a new multi-service control plane.", tier: "frontier" },
    { prompt: "Build a complete compiler toolchain from scratch.", tier: "frontier" },
    {
      prompt: "Create an MCP application system for a new CTF team with custom review logic.",
      tier: "frontier",
    },
    {
      prompt: "Make a website that watches CTF listings and sends email or Discord bot alerts.",
      tier: "frontier",
    },
    {
      prompt: "Make a website that watches CTFs and emails me/Discord bot/whatever pings me.",
      tier: "frontier",
    },
    {
      prompt: "Assess an untrusted agent transcript and decide whether the planned action is allowed.",
      tier: "frontier",
    },
    { prompt: "Review this authentication flow for security vulnerabilities.", tier: "frontier" },
    { prompt: "Deploy the current build to the live production service.", tier: "frontier" },
    { prompt: "Delete all stale Docker volumes and reset the database.", tier: "frontier" },
    { prompt: "Write detailed legal advice for this active contract dispute.", tier: "frontier" },
    { prompt: "Yeah, test that and make sure it works.", tier: "frontier" },
    { prompt: "Go fix the football model things please.", tier: "frontier" },
    { prompt: "Check the to-do list and see what needs to be done in Obsidian.", tier: "balanced" },
    { prompt: "Look for jobs that fit my current resume and hard requirements.", tier: "frontier" },
    { prompt: "Take care of this for me.", tier: "frontier" },
  ];

  for (const sample of cases) {
    it(`routes ${sample.tier}: ${sample.prompt}`, async () => {
      const result = await buildDryRun({
        client: "codex",
        prompt: sample.prompt,
        cwd: looseFolder,
      });

      expect(result.recommendation.tier).toBe(sample.tier);
    });
  }
});
