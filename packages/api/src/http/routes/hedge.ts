// /hedge routes — build the unsigned two-leg hedge quote.

import { Hono } from "hono";
import { z } from "zod";
import type { HedgeService } from "../../core/services/hedge.js";
import { keelError } from "../../core/domain/errors.js";
import { sendError } from "../errors.js";

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed address")
  .transform((s) => s as `0x${string}`);

const hexData = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "must be 0x-prefixed hex")
  .transform((s) => s as `0x${string}`);

const decimalAmount = z.string().regex(/^\d+(\.\d+)?$/, "must be a decimal amount");

const QuoteBody = z.object({
  fromAddress: hexAddress,
  fromChain: z.number().int().positive(),
  perpCollateralUsd: decimalAmount,
  keelCollateralUsd: decimalAmount,
  slippage: z.number().positive().max(1).optional(),
  keelCallData: hexData.optional(),
});

export function hedgeRoutes(hedge: HedgeService): Hono {
  const app = new Hono();

  // POST /hedge/quote — build both legs (deposit always; open when wired).
  app.post("/quote", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = QuoteBody.safeParse(json);
    if (!parsed.success) {
      return sendError(
        c,
        keelError("VALIDATION_FAILED", "invalid hedge quote body", {
          issues: parsed.error.issues,
        }),
      );
    }
    const result = await hedge.quoteHedge(parsed.data);
    if (!result.ok) return sendError(c, result.error);
    return c.json(result.value);
  });

  return app;
}
