// HTTP composition root — wires services into the Hono app. The MCP skin and
// the workers consume the same services; this file only knows about routing.

import { Hono } from "hono";
import type { FundingService } from "../core/services/funding.js";
import type { HedgeService } from "../core/services/hedge.js";
import type { PositionService } from "../core/services/position.js";
import type { SettleService } from "../core/services/settle.js";
import type { RebalanceService } from "../core/services/rebalance.js";
import type { ExecutionService } from "../core/services/execution.js";
import { fundingRoutes } from "./routes/funding.js";
import { hedgeRoutes } from "./routes/hedge.js";
import { positionsRoutes } from "./routes/positions.js";
import { executionRoutes } from "./routes/execution.js";
import { eventsRoutes } from "./routes/events.js";

export interface AppDeps {
  network: "mainnet" | "testnet";
  funding: FundingService;
  hedge: HedgeService;
  positions: PositionService;
  settle: SettleService;
  rebalance: RebalanceService;
  execution: ExecutionService;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ ok: true, service: "keel-api", network: deps.network }),
  );

  app.route("/funding", fundingRoutes(deps.funding));
  app.route("/hedge", hedgeRoutes(deps.hedge, deps.positions));
  app.route(
    "/positions",
    positionsRoutes(deps.positions, deps.settle, deps.rebalance, deps.execution),
  );
  app.route("/execution", executionRoutes(deps.execution));
  app.route("/events", eventsRoutes(deps.positions));

  return app;
}
