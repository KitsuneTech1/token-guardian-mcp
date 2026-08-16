import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzePreflight } from "../src/preflight.js";

const temporaryDirectories: string[] = [];

async function emptyTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "token-guardian-preflight-"));
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

describe("analyzePreflight", () => {
  it("classifies a coding prompt without requiring a repository", async () => {
    const cwd = await emptyTemporaryDirectory();

    const result = await analyzePreflight({
      prompt: "Implement a small TypeScript parser for these bounded log rows.",
      cwd,
    });

    expect(result.taskKind).toBe("coding");
    expect(result.risk).toBe("normal");
    expect(result.confidence).toBe("high");
    expect(result.workspace.kind).toBe("loose");
    expect(result.workspace.markers).toEqual([]);
  });

  it("uses project markers as optional evidence without requiring Git", async () => {
    const cwd = await emptyTemporaryDirectory();
    await writeFile(join(cwd, "package.json"), "this content must not be read");

    const result = await analyzePreflight({
      prompt: "Fix the failing parser test.",
      cwd,
    });

    expect(result.taskKind).toBe("debugging");
    expect(result.workspace.kind).toBe("project");
    expect(result.workspace.markers).toContain("package.json");
  });

  it("gives destructive production language precedence over ordinary coding words", async () => {
    const cwd = await emptyTemporaryDirectory();

    const result = await analyzePreflight({
      prompt: "Delete the live production database and rebuild the API schema.",
      cwd,
    });

    expect(result.taskKind).toBe("destructive");
    expect(result.risk).toBe("critical");
    expect(result.confidence).toBe("high");
  });

  it("treats untrusted agent-action assessment as security work", async () => {
    const cwd = await emptyTemporaryDirectory();

    const result = await analyzePreflight({
      prompt:
        "Assess this untrusted agent transcript and decide whether its planned action is allowed.",
      cwd,
    });

    expect(result.taskKind).toBe("security");
    expect(result.risk).toBe("high");
  });

  it("explains employment routing without calling it legal or medical advice", async () => {
    const cwd = await emptyTemporaryDirectory();

    const result = await analyzePreflight({
      prompt: "Look for jobs that fit my current resume and hard requirements.",
      cwd,
    });

    expect(result.risk).toBe("high");
    expect(result.evidence).toContain(
      "The prompt involves a consequential employment decision.",
    );
    expect(result.evidence.join(" ")).not.toContain("legal, medical, or financial");
  });

  it("leaves a vague prompt unclassified so routing fails closed", async () => {
    const cwd = await emptyTemporaryDirectory();

    const result = await analyzePreflight({ prompt: "Handle this thing.", cwd });

    expect(result.taskKind).toBeUndefined();
    expect(result.confidence).toBe("low");
    expect(result.risk).toBe("normal");
  });

  it("rejects an empty prompt", async () => {
    await expect(
      analyzePreflight({ prompt: "   ", cwd: await emptyTemporaryDirectory() }),
    ).rejects.toThrow("Prompt cannot be empty");
  });
});
