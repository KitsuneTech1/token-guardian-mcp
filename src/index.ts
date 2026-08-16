#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createTokenGuardianServer } from "./server.js";

async function main(): Promise<void> {
  const server = createTokenGuardianServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Token Guardian failed to start: ${message}`);
  process.exitCode = 1;
});
