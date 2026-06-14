// HedgePosition domain — the lifecycle of a single hedge and its state machine.
// Every money-touching action is gated by a legal transition; illegal jumps are
// rejected at the service layer, never silently applied.

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

/** Legal transitions. FAILED is reachable from any non-terminal state. */
const TRANSITIONS: Record<PositionStatus, readonly PositionStatus[]> = {
  DRAFT: ["QUOTED", "FAILED"],
  QUOTED: ["DEPOSIT_PENDING", "FAILED"],
  DEPOSIT_PENDING: ["DEPOSIT_DONE", "FAILED"],
  DEPOSIT_DONE: ["PERP_PENDING", "FAILED"],
  PERP_PENDING: ["OPEN", "FAILED"],
  OPEN: ["SETTLING", "REBALANCING", "CLOSING", "FAILED"],
  SETTLING: ["OPEN", "CLOSING", "FAILED"],
  REBALANCING: ["OPEN", "CLOSING", "FAILED"],
  CLOSING: ["CLOSED", "FAILED"],
  CLOSED: [],
  FAILED: [],
};

/** States this status may legally move to. */
export function nextStates(from: PositionStatus): readonly PositionStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Whether `from → to` is a legal transition. */
export function canTransition(from: PositionStatus, to: PositionStatus): boolean {
  return nextStates(from).includes(to);
}

/** Terminal states have no outgoing transitions. */
export function isTerminal(status: PositionStatus): boolean {
  return nextStates(status).length === 0;
}

/** A live hedge position. `quote` holds the last LI.FI HedgeQuote (JSON). */
export interface HedgePosition {
  id: string;
  status: PositionStatus;
  /** Perp market whose funding this hedge tracks (e.g. "BTC"). */
  market: string;
  /** Address funding both legs (the hedger). */
  hedger: `0x${string}`;
  fromChain: number;
  perpCollateralUsd: string;
  keelCollateralUsd: string;
  quote: unknown | null;
  createdAt: number;
  updatedAt: number;
}

/** A timeline entry — every transition records timestamp, txHash and signer. */
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
