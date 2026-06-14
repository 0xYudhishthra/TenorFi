// execution service — the perp-execution intent queue. The API enqueues; the
// non-US execution node polls pending intents, signs + submits, and reports the
// result here. On a result we record it on the intent and on the position timeline.

import { ok, err, type Result } from "../domain/result.js";
import { keelError, type KeelError } from "../domain/errors.js";
import type { ExecutionIntent, ExecutionRepo } from "../repos/execution.js";
import type { PositionService } from "./position.js";

export interface ExecutionService {
  enqueue(input: {
    positionId: string;
    kind: string;
    market: string;
    params?: unknown;
  }): ExecutionIntent;
  pending(): ExecutionIntent[];
  recordResult(
    intentId: string,
    result: { txHash?: string; error?: string },
  ): Result<ExecutionIntent, KeelError>;
}

export function createExecutionService(
  repo: ExecutionRepo,
  positions: PositionService,
): ExecutionService {
  return {
    enqueue(input) {
      return repo.enqueue(input);
    },

    pending() {
      return repo.pending();
    },

    recordResult(intentId, result) {
      const intent = repo.get(intentId);
      if (!intent) {
        return err(keelError("INTENT_NOT_FOUND", `no intent ${intentId}`, { intentId }));
      }
      const succeeded = !!result.txHash && !result.error;
      repo.setResult(intentId, {
        status: succeeded ? "done" : "failed",
        txHash: result.txHash,
        error: result.error,
      });
      // Mirror the outcome onto the position timeline (also feeds SSE).
      positions.note(intent.positionId, {
        type: succeeded ? "execution-done" : "execution-failed",
        txHash: result.txHash,
        detail: { intentId, kind: intent.kind, error: result.error },
      });
      return ok({
        ...intent,
        status: succeeded ? "done" : "failed",
        txHash: result.txHash ?? null,
        error: result.error ?? null,
        updatedAt: Date.now(),
      });
    },
  };
}
