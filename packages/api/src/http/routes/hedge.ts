// /hedge routes — build the unsigned quote (POST /hedge/quote) and create a
// persisted position from a fresh quote (POST /hedge).

import { Hono } from "hono";
import { z } from "zod";
import type { HedgeService } from "../../core/services/hedge.js";
import type { PositionService } from "../../core/services/position.js";
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

const CreateBody = QuoteBody.extend({
  market: z.string().min(1).default("BTC"),
});

export function hedgeRoutes(
  hedge: HedgeService,
  positions: PositionService,
): Hono {
  const app = new Hono();

  // POST /hedge/quote — build both legs (deposit always; open when wired). Stateless.
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

  // POST /hedge — quote, then persist a position (DRAFT → QUOTED).
  app.post("/", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = CreateBody.safeParse(json);
    if (!parsed.success) {
      return sendError(
        c,
        keelError("VALIDATION_FAILED", "invalid hedge body", {
          issues: parsed.error.issues,
        }),
      );
    }
    const { market, ...quoteParams } = parsed.data;
    const quoted = await hedge.quoteHedge(quoteParams);
    if (!quoted.ok) return sendError(c, quoted.error);

    const created = positions.openHedge({
      market,
      hedger: quoteParams.fromAddress,
      fromChain: quoteParams.fromChain,
      perpCollateralUsd: quoteParams.perpCollateralUsd,
      keelCollateralUsd: quoteParams.keelCollateralUsd,
      quote: quoted.value,
    });
    if (!created.ok) return sendError(c, created.error);

    return c.json(
      { positionId: created.value.id, status: created.value.status, quote: quoted.value },
      201,
    );
  });

  return app;
}
