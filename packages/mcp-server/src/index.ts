#!/usr/bin/env node
export * from "./tools.js";
export * from "./dispatcher.js";

import { dispatchTool } from "./dispatcher.js";
import type { ToolCall } from "./tools.js";

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  const chunks: Buffer[] = [];
  process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
  process.stdin.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
      console.log(JSON.stringify({ ok: true, tools: [] }));
      return;
    }
    dispatchTool(JSON.parse(raw) as ToolCall)
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(
          JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
        );
        process.exitCode = 1;
      });
  });
}
