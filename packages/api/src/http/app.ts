// HTTP composition root — wires services into the Hono app. The MCP skin and
// the workers consume the same services; this file only knows about routing.

import { Hono } from "hono";
import type { FundingService } from "../core/services/funding.js";
import type { HedgeService } from "../core/services/hedge.js";
import { fundingRoutes } from "./routes/funding.js";
import { hedgeRoutes } from "./routes/hedge.js";

export interface AppDeps {
  network: "mainnet" | "testnet";
  funding: FundingService;
  hedge: HedgeService;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ ok: true, service: "keel-api", network: deps.network }),
  );

  app.route("/funding", fundingRoutes(deps.funding));
  app.route("/hedge", hedgeRoutes(deps.hedge));

  return app;
}
