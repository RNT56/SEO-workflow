#!/usr/bin/env node
export * from "./tools.js";
export * from "./dispatcher.js";
export * from "./server.js";

import { startStdioServer } from "./server.js";

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  startStdioServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
