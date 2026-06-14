// /positions routes — list positions and fetch one with its event timeline.

import { Hono } from "hono";
import type { PositionService } from "../../core/services/position.js";
import type { HedgePosition } from "../../core/domain/position.js";
import { sendError } from "../errors.js";

/** List view omits the heavy quote blob; fetch the detail for the full quote. */
function summarize(p: HedgePosition) {
  const { quote: _quote, ...summary } = p;
  return summary;
}

export function positionsRoutes(positions: PositionService): Hono {
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

  return app;
}
