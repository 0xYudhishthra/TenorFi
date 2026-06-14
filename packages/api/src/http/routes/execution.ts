// /execution routes — the execution node polls pending intents and reports back.

import { Hono } from "hono";
import { z } from "zod";
import type { ExecutionService } from "../../core/services/execution.js";
import { keelError } from "../../core/domain/errors.js";
import { sendError } from "../errors.js";

const ResultBody = z
  .object({
    // HL L1 actions have no EVM tx hash — accept any non-empty ref (order id/status).
    txHash: z.string().min(1).optional(),
    error: z.string().optional(),
  })
  .refine((b) => b.txHash || b.error, {
    message: "provide txHash (success) or error (failure)",
  });

export function executionRoutes(execution: ExecutionService): Hono {
  const app = new Hono();

  // GET /execution/pending — intents waiting for the node to sign + submit.
  app.get("/pending", (c) => c.json({ intents: execution.pending() }));

  // POST /execution/:intentId/result — node reports the signed tx or a failure.
  app.post("/:intentId/result", async (c) => {
    const intentId = c.req.param("intentId");
    const json = await c.req.json().catch(() => null);
    const parsed = ResultBody.safeParse(json);
    if (!parsed.success) {
      return sendError(
        c,
        keelError("VALIDATION_FAILED", "invalid execution result body", {
          issues: parsed.error.issues,
        }),
      );
    }
    const result = execution.recordResult(intentId, parsed.data);
    if (!result.ok) return sendError(c, result.error);
    return c.json({ intent: result.value });
  });

  return app;
}
