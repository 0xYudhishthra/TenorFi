// Execution node — the standalone signer for the perp leg. It polls the API for
// pending intents, runs an `executor` (which signs + submits to HL with its OWN
// agent wallet), and reports the result back. This is the ONLY piece that holds
// the HL key and the ONLY piece that must run from a non-US IP (geoblock).

import { intervalWorker, type Worker } from "../workers/loop.js";

export interface PendingIntent {
  id: string;
  positionId: string;
  kind: string;
  market: string;
  params: unknown;
}

export interface ExecutionResult {
  txHash?: string;
  error?: string;
}

export type Executor = (intent: PendingIntent) => Promise<ExecutionResult>;

/** Pluggable transport so tests can drive the in-process app via app.request. */
export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export function createExecutionNode(deps: {
  baseUrl?: string;
  executor: Executor;
  fetcher?: Fetcher;
  pollMs?: number;
}): Worker {
  const baseUrl = deps.baseUrl ?? "";
  const fetcher: Fetcher = deps.fetcher ?? ((p, i) => fetch(`${baseUrl}${p}`, i));
  const pollMs = deps.pollMs ?? 5_000;

  return intervalWorker("execution-node", async () => {
    const res = await fetcher("/execution/pending");
    if (!res.ok) return;
    const { intents } = (await res.json()) as { intents: PendingIntent[] };

    for (const intent of intents) {
      const result = await deps.executor(intent);
      await fetcher(`/execution/${intent.id}/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
    }
  }, pollMs);
}
