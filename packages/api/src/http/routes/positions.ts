// /positions routes — read (list, detail) plus lifecycle actions (confirm-tx,
// settle, rebalance). Actions that move state go through the state machine.

import { Hono } from "hono";
import { z } from "zod";
import type { PositionService } from "../../core/services/position.js";
import type { SettleService } from "../../core/services/settle.js";
import type { RebalanceService } from "../../core/services/rebalance.js";
import type { HedgePosition } from "../../core/domain/position.js";
import { POSITION_STATUSES } from "../../core/domain/position.js";
import { keelError } from "../../core/domain/errors.js";
import { sendError } from "../errors.js";

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed address")
  .transform((s) => s as `0x${string}`);

const hexData = z.string().regex(/^0x[0-9a-fA-F]+$/, "must be 0x-prefixed hex");

const ConfirmTxBody = z.object({
  to: z.enum(POSITION_STATUSES),
  txHash: hexData,
  signer: hexAddress.optional(),
  note: z.string().optional(),
});

const SettleBody = z.object({
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  fixedRateAnnualized: z.number(),
  notionalUsd: z.number().positive(),
  cap: z.number().positive().optional(),
});

const RebalanceBody = z.object({
  thresholdUsd: z.number().nonnegative(),
  targetUsd: z.number().positive(),
  address: hexAddress.optional(),
});

/** List view omits the heavy quote blob; fetch the detail for the full quote. */
function summarize(p: HedgePosition) {
  const { quote: _quote, ...summary } = p;
  return summary;
}

export function positionsRoutes(
  positions: PositionService,
  settle: SettleService,
  rebalance: RebalanceService,
): Hono {
  const app = new Hono();

  // GET /positions — newest first, summaries only.
  app.get("/", (c) => {
    const list = positions.list().map(summarize);
    return c.json({ positions: list });
  });

  // GET /positions/:id — full position + event timeline.
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const result = positions.get(id);
    if (!result.ok) return sendError(c, result.error);
    return c.json({ position: result.value, events: positions.events(id) });
  });

  // POST /positions/:id/confirm-tx — record a signed tx and advance state.
  app.post("/:id/confirm-tx", async (c) => {
    const id = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = ConfirmTxBody.safeParse(json);
    if (!parsed.success) {
      return sendError(
        c,
        keelError("VALIDATION_FAILED", "invalid confirm-tx body", {
          issues: parsed.error.issues,
        }),
      );
    }
    const { to, txHash, signer, note } = parsed.data;
    const result = positions.transition(id, to, {
      type: "confirm-tx",
      txHash,
      signer,
      detail: note,
    });
    if (!result.ok) return sendError(c, result.error);
    return c.json({ position: result.value });
  });

  // POST /positions/:id/settle — compute the settlement for a period (prep only).
  app.post("/:id/settle", async (c) => {
    const id = c.req.param("id");
    const pos = positions.get(id);
    if (!pos.ok) return sendError(c, pos.error);

    const json = await c.req.json().catch(() => null);
    const parsed = SettleBody.safeParse(json);
    if (!parsed.success) {
      return sendError(
        c,
        keelError("VALIDATION_FAILED", "invalid settle body", {
          issues: parsed.error.issues,
        }),
      );
    }
    const result = await settle.prepare({ market: pos.value.market, ...parsed.data });
    if (!result.ok) return sendError(c, result.error);
    return c.json(result.value);
  });

  // POST /positions/:id/rebalance — assess HL margin and prepare a top-up intent.
  app.post("/:id/rebalance", async (c) => {
    const id = c.req.param("id");
    const pos = positions.get(id);
    if (!pos.ok) return sendError(c, pos.error);

    const json = await c.req.json().catch(() => null);
    const parsed = RebalanceBody.safeParse(json);
    if (!parsed.success) {
      return sendError(
        c,
        keelError("VALIDATION_FAILED", "invalid rebalance body", {
          issues: parsed.error.issues,
        }),
      );
    }
    const result = await rebalance.assess({
      address: parsed.data.address ?? pos.value.hedger,
      market: pos.value.market,
      thresholdUsd: parsed.data.thresholdUsd,
      targetUsd: parsed.data.targetUsd,
    });
    if (!result.ok) return sendError(c, result.error);
    return c.json(result.value);
  });

  return app;
}
