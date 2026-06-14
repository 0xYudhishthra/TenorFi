import { ExchangeClient, InfoClient, type HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { createTransport, type Network } from "./config.js";

function requireAgentKey(): `0x${string}` {
  const k = process.env.HL_AGENT_PRIVATE_KEY;
  if (!k) throw new Error("HL_AGENT_PRIVATE_KEY not set");
  return (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
}

/**
 * Build an authenticated exchange client from an agent/API wallet private key.
 * The agent must have been approved by the master account (ApproveAgent) — it can
 * place/cancel orders on the master's behalf, but cannot withdraw or move funds.
 */
export function createExchangeClient(
  agentPrivateKey: `0x${string}` = requireAgentKey(),
  network?: Network,
  transport: HttpTransport = createTransport(network),
): ExchangeClient {
  const wallet = privateKeyToAccount(agentPrivateKey);
  return new ExchangeClient({ transport, wallet });
}

/** Asset metadata needed to size and price orders. */
export interface AssetMeta {
  index: number;
  szDecimals: number;
}

export async function getAssetMeta(
  market: string,
  transport: HttpTransport = createTransport(),
): Promise<AssetMeta> {
  const info = new InfoClient({ transport });
  const meta = await info.meta();
  const index = meta.universe.findIndex((u) => u.name === market);
  if (index < 0) throw new Error(`market not found on Hyperliquid: ${market}`);
  return { index, szDecimals: meta.universe[index]!.szDecimals };
}

/** Round a size to the market's szDecimals (Hyperliquid requirement). */
export function formatSize(size: number, szDecimals: number): string {
  return size.toFixed(szDecimals);
}

/**
 * Format a price to Hyperliquid's rules: ≤5 significant figures and at most
 * (6 − szDecimals) decimal places for perps. NOTE: validate against a live order
 * when the account is operational — rounding edge cases aren't exercised yet.
 */
export function formatPrice(px: number, szDecimals: number): string {
  if (px <= 0) throw new Error("price must be > 0");
  const maxDecimals = Math.max(0, 6 - szDecimals);
  const sigFig = Number(px.toPrecision(5));
  return String(Number(sigFig.toFixed(maxDecimals)));
}

/** Set cross/isolated leverage for a market. */
export async function updateLeverage(params: {
  market: string;
  leverage: number;
  isCross?: boolean;
  client?: ExchangeClient;
  transport?: HttpTransport;
}): ReturnType<ExchangeClient["updateLeverage"]> {
  const transport = params.transport ?? createTransport();
  const client = params.client ?? createExchangeClient(undefined, undefined, transport);
  const { index } = await getAssetMeta(params.market, transport);
  return client.updateLeverage({
    asset: index,
    isCross: params.isCross ?? false,
    leverage: params.leverage,
  });
}

/**
 * Place a market order as an aggressive IoC limit (Hyperliquid has no pure market
 * type). Uses the current mark price ± slippage.
 */
export async function placePerpOrder(params: {
  market: string;
  isBuy: boolean;
  size: number;
  slippage?: number;
  reduceOnly?: boolean;
  client?: ExchangeClient;
  transport?: HttpTransport;
}) {
  const transport = params.transport ?? createTransport();
  const client = params.client ?? createExchangeClient(undefined, undefined, transport);
  const info = new InfoClient({ transport });
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const index = meta.universe.findIndex((u) => u.name === params.market);
  if (index < 0) throw new Error(`market not found on Hyperliquid: ${params.market}`);
  const szDecimals = meta.universe[index]!.szDecimals;
  const mark = Number(ctxs[index]!.markPx);
  const slip = params.slippage ?? 0.05;
  const px = params.isBuy ? mark * (1 + slip) : mark * (1 - slip);
  return client.order({
    orders: [
      {
        a: index,
        b: params.isBuy,
        p: formatPrice(px, szDecimals),
        s: formatSize(params.size, szDecimals),
        r: params.reduceOnly ?? false,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
  });
}

/** Add isolated margin (USDC) to an open position. */
export async function topUpMargin(params: {
  market: string;
  usdc: number;
  isBuy?: boolean;
  client?: ExchangeClient;
  transport?: HttpTransport;
}): ReturnType<ExchangeClient["updateIsolatedMargin"]> {
  const transport = params.transport ?? createTransport();
  const client = params.client ?? createExchangeClient(undefined, undefined, transport);
  const { index } = await getAssetMeta(params.market, transport);
  return client.updateIsolatedMargin({
    asset: index,
    isBuy: params.isBuy ?? true,
    ntli: params.usdc,
  });
}

/** Close an open position with a reduce-only market order on the opposite side. */
export async function closePosition(params: {
  market: string;
  masterAddress?: `0x${string}`;
  slippage?: number;
  client?: ExchangeClient;
  transport?: HttpTransport;
}) {
  const transport = params.transport ?? createTransport();
  const master =
    params.masterAddress ?? (process.env.HL_MASTER_ADDRESS as `0x${string}` | undefined);
  if (!master) throw new Error("master address required (param or HL_MASTER_ADDRESS)");
  const info = new InfoClient({ transport });
  const state = await info.clearinghouseState({ user: master });
  const pos = state.assetPositions.find((p) => p.position.coin === params.market);
  if (!pos) throw new Error(`no open position for ${params.market}`);
  const szi = Number(pos.position.szi);
  if (szi === 0) throw new Error(`position size is 0 for ${params.market}`);
  return placePerpOrder({
    market: params.market,
    isBuy: szi < 0, // close a short by buying, a long by selling
    size: Math.abs(szi),
    reduceOnly: true,
    slippage: params.slippage,
    client: params.client,
    transport,
  });
}
