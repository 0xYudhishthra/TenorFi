/* ============================================================================
   TENORFI — typed keel-api client (browser fetch wrapper).
   Base URL from NEXT_PUBLIC_API_URL (default http://localhost:8080).
   Every function returns typed data and THROWS on any failure (network or
   non-2xx) so callers can try/catch and fall back to the mock dataset.
   No heavy deps — plain fetch + the browser EventSource for SSE.
   Shapes mirror packages/api exactly (see route + service files).
   ============================================================================ */

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");

/* ---- response shapes (mirror packages/api) ------------------------------- */

/** GET /funding/:market — FundingService.FundingSnapshot (extends FundingInfo). */
export interface FundingSnapshot {
  market: string;
  /** Current funding rate for the period (hourly on HL), as a fraction. */
  funding: number;
  markPx: number;
  oraclePx: number;
  premium: number | null;
  openInterest: number;
  /** Current funding rate annualized (fraction), for display. */
  annualized: number;
  /** Epoch millis the snapshot was read. */
  fetchedAt: number;
}

/** One row of GET /funding/:market/history (hyperliquid FundingHistoryEntry). */
export interface FundingHistoryEntry {
  market: string;
  /** Funding rate for that hour, as a fraction. */
  fundingRate: number;
  premium: number;
  /** Unix epoch millis of the observation. */
  time: number;
}

/** GET /funding/:market/history → { market, history }. */
export interface FundingHistoryResponse {
  market: string;
  history: FundingHistoryEntry[];
}

export const POSITION_STATUSES = [
  "DRAFT",
  "QUOTED",
  "DEPOSIT_PENDING",
  "DEPOSIT_DONE",
  "PERP_PENDING",
  "OPEN",
  "SETTLING",
  "REBALANCING",
  "CLOSING",
  "CLOSED",
  "FAILED",
] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

/** A position summary (GET /positions omits the heavy `quote` blob). */
export interface PositionSummary {
  id: string;
  status: PositionStatus;
  market: string;
  hedger: `0x${string}`;
  fromChain: number;
  perpCollateralUsd: string;
  keelCollateralUsd: string;
  createdAt: number;
  updatedAt: number;
}

/** Full position (GET /positions/:id) carries the `quote` blob too. */
export interface PositionDetail extends PositionSummary {
  quote: unknown | null;
}

/** A timeline entry (also the SSE event payload). */
export interface PositionEvent {
  id: string;
  positionId: string;
  type: string;
  fromStatus: PositionStatus | null;
  toStatus: PositionStatus | null;
  txHash: string | null;
  signer: string | null;
  detail: unknown | null;
  at: number;
}

/** GET /positions → { positions }. */
export interface ListPositionsResponse {
  positions: PositionSummary[];
}

/** GET /positions/:id → { position, events }. */
export interface GetPositionResponse {
  position: PositionDetail;
  events: PositionEvent[];
}

/** POST /hedge/quote body (HedgeService.QuoteHedgeParams). */
export interface QuoteHedgeBody {
  fromAddress: `0x${string}`;
  fromChain: number;
  /** USDC perp collateral, decimal string (e.g. "5"). */
  perpCollateralUsd: string;
  /** USDC keel-swap collateral, decimal string. */
  keelCollateralUsd: string;
  slippage?: number;
  keelCallData?: `0x${string}`;
}

/** POST /hedge/quote → HedgeQuote. `deposit`/`open` are opaque LI.FI blobs. */
export interface HedgeQuote {
  /** Leg 1: bridge + deposit perp collateral. Always built. */
  deposit: unknown;
  /** Leg 2: bridge + KeelSwap.open. Null until the contract is wired. */
  open: unknown | null;
  /** Human-readable notes (e.g. why the open leg was skipped). */
  notes: string[];
}

/* ---- fetch core ----------------------------------------------------------- */

/** keel-api error envelope (see packages/api/src/http/errors.ts). */
interface KeelErrorEnvelope {
  error?: { code?: string; message?: string };
}

/**
 * Typed GET. Throws on network error or non-2xx. The caller is expected to
 * try/catch and fall back to mock data so the demo never blanks out.
 */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as KeelErrorEnvelope | null;
    const msg = body?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`keel-api GET ${path} failed: ${msg}`);
  }
  return (await res.json()) as T;
}

/** Typed POST. Same throw-on-failure contract as getJson. */
async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as KeelErrorEnvelope | null;
    const msg = errBody?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`keel-api POST ${path} failed: ${msg}`);
  }
  return (await res.json()) as T;
}

/* ---- public API ----------------------------------------------------------- */

/** GET /funding/:market — current funding + price snapshot. */
export function getFunding(
  market: string,
  signal?: AbortSignal,
): Promise<FundingSnapshot> {
  return getJson<FundingSnapshot>(
    `/funding/${encodeURIComponent(market.toUpperCase())}`,
    signal,
  );
}

/**
 * GET /funding/:market/history?startTime=&endTime= — historical funding rates.
 * `startTime`/`endTime` are epoch millis. Defaults to the last 24h.
 */
export function getFundingHistory(
  market: string,
  startTime: number = Date.now() - 24 * 60 * 60 * 1000,
  endTime?: number,
  signal?: AbortSignal,
): Promise<FundingHistoryResponse> {
  const qs = new URLSearchParams({ startTime: String(Math.floor(startTime)) });
  if (endTime !== undefined) qs.set("endTime", String(Math.floor(endTime)));
  return getJson<FundingHistoryResponse>(
    `/funding/${encodeURIComponent(market.toUpperCase())}/history?${qs.toString()}`,
    signal,
  );
}

/** GET /positions — newest-first summaries. */
export async function listPositions(
  signal?: AbortSignal,
): Promise<PositionSummary[]> {
  const res = await getJson<ListPositionsResponse>("/positions", signal);
  return res.positions;
}

/** GET /positions/:id — full position + event timeline. */
export function getPosition(
  id: string,
  signal?: AbortSignal,
): Promise<GetPositionResponse> {
  return getJson<GetPositionResponse>(
    `/positions/${encodeURIComponent(id)}`,
    signal,
  );
}

/** POST /hedge/quote — build the (unsigned) two-leg hedge quote. */
export function quoteHedge(
  body: QuoteHedgeBody,
  signal?: AbortSignal,
): Promise<HedgeQuote> {
  return postJson<HedgeQuote>("/hedge/quote", body, signal);
}

/* ---- SSE ------------------------------------------------------------------ */

/**
 * Subscribe to GET /events/:id (Server-Sent Events). Replays the timeline then
 * streams live events. Uses the browser EventSource — no polyfill needed in the
 * browser. Returns an unsubscribe fn; degrades silently if EventSource is
 * unavailable (e.g. SSR) by returning a no-op.
 *
 * The server emits one named event per `PositionEvent.type` (created,
 * transition, …) plus periodic "ping" heartbeats (ignored here). We attach a
 * generic message handler plus listeners for the known event types.
 */
export function subscribePositionEvents(
  id: string,
  onEvent: (event: PositionEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }
  let es: EventSource;
  try {
    es = new EventSource(`${API_BASE_URL}/events/${encodeURIComponent(id)}`);
  } catch (err) {
    onError?.(err);
    return () => {};
  }

  const handle = (ev: MessageEvent) => {
    try {
      const parsed = JSON.parse(ev.data) as PositionEvent;
      if (parsed && typeof parsed === "object" && "id" in parsed) onEvent(parsed);
    } catch {
      /* ignore non-JSON frames (e.g. ping heartbeats) */
    }
  };

  // Server pushes named events; cover both the generic channel and known names.
  es.onmessage = handle;
  for (const name of ["created", "transition", "note", "execution"]) {
    es.addEventListener(name, handle as EventListener);
  }
  es.onerror = (err) => onError?.(err);

  return () => {
    try {
      es.close();
    } catch {
      /* noop */
    }
  };
}
