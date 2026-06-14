// /funding routes — current funding snapshot + historical rates for a market.

import { Hono } from "hono";
import { z } from "zod";
import type { FundingService } from "../../core/services/funding.js";
import { keelError } from "../../core/domain/errors.js";
import { sendError } from "../errors.js";

const HistoryQuery = z.object({
  startTime: z.coerce.number().int().nonnegative(),
  endTime: z.coerce.number().int().nonnegative().optional(),
});

export function fundingRoutes(funding: FundingService): Hono {
  const app = new Hono();

  // GET /funding/:market — current funding + price snapshot (cached).
  app.get("/:market", async (c) => {
    const market = c.req.param("market").toUpperCase();
    const result = await funding.getFunding(market);
    if (!result.ok) return sendError(c, result.error);
    return c.json(result.value);
  });

  // GET /funding/:market/history?startTime=&endTime= — historical funding.
  app.get("/:market/history", async (c) => {
    const market = c.req.param("market").toUpperCase();
    const parsed = HistoryQuery.safeParse({
      startTime: c.req.query("startTime"),
      endTime: c.req.query("endTime"),
    });
    if (!parsed.success) {
      return sendError(
        c,
        keelError("VALIDATION_FAILED", "invalid query params", {
          issues: parsed.error.issues,
        }),
      );
    }
    const { startTime, endTime } = parsed.data;
    const result = await funding.getFundingHistory(market, startTime, endTime);
    if (!result.ok) return sendError(c, result.error);
    return c.json({ market, history: result.value });
  });

  return app;
}
