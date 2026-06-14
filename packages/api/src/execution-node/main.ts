// Execution-node entrypoint. Run on a NON-US host with HL_AGENT_PRIVATE_KEY set.
// Polls the API for pending perp intents, signs them, and reports back.

import { createHlExecutor } from "./hl-executor.js";
import { createExecutionNode } from "./node.js";

if (!process.env.HL_AGENT_PRIVATE_KEY) {
  throw new Error("HL_AGENT_PRIVATE_KEY is required to run the execution node");
}

const baseUrl = process.env.API_URL ?? "http://localhost:8080";
const pollMs = Number(process.env.EXEC_POLL_MS ?? 5_000);

const node = createExecutionNode({
  baseUrl,
  executor: createHlExecutor(),
  pollMs,
});
node.start();

console.log(`keel execution-node → polling ${baseUrl}/execution/pending every ${pollMs}ms`);
