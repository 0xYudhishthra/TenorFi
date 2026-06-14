// position service — CRUD plus state-machine-gated transitions. Every transition
// is validated against the domain machine and recorded as a timeline event.

import { ok, err, type Result } from "../domain/result.js";
import { keelError, type KeelError } from "../domain/errors.js";
import {
  canTransition,
  type HedgePosition,
  type PositionEvent,
  type PositionStatus,
} from "../domain/position.js";
import type { PositionRepo } from "../repos/positions.js";

export interface OpenHedgeInput {
  market: string;
  hedger: `0x${string}`;
  fromChain: number;
  perpCollateralUsd: string;
  keelCollateralUsd: string;
  /** The LI.FI HedgeQuote backing this position. */
  quote: unknown;
}

export interface TransitionMeta {
  type?: string;
  txHash?: string;
  signer?: string;
  detail?: unknown;
}

export interface PositionService {
  /** Create a position from a fresh quote: DRAFT → QUOTED, both recorded. */
  openHedge(input: OpenHedgeInput): Result<HedgePosition, KeelError>;
  get(id: string): Result<HedgePosition, KeelError>;
  list(): HedgePosition[];
  events(id: string): PositionEvent[];
  /** Move a position to `to`, gated by the state machine. */
  transition(
    id: string,
    to: PositionStatus,
    meta?: TransitionMeta,
  ): Result<HedgePosition, KeelError>;
}

export function createPositionService(repo: PositionRepo): PositionService {
  return {
    openHedge(input) {
      const pos = repo.create({ ...input, status: "DRAFT" });
      repo.appendEvent({
        positionId: pos.id,
        type: "created",
        toStatus: "DRAFT",
      });
      // We already hold a quote, so advance to QUOTED immediately.
      repo.updateStatus(pos.id, "QUOTED", Date.now());
      repo.appendEvent({
        positionId: pos.id,
        type: "transition",
        fromStatus: "DRAFT",
        toStatus: "QUOTED",
      });
      return ok({ ...pos, status: "QUOTED" });
    },

    get(id) {
      const pos = repo.get(id);
      if (!pos) {
        return err(keelError("POSITION_NOT_FOUND", `no position ${id}`, { id }));
      }
      return ok(pos);
    },

    list() {
      return repo.list();
    },

    events(id) {
      return repo.events(id);
    },

    transition(id, to, meta) {
      const pos = repo.get(id);
      if (!pos) {
        return err(keelError("POSITION_NOT_FOUND", `no position ${id}`, { id }));
      }
      if (!canTransition(pos.status, to)) {
        return err(
          keelError(
            "INVALID_TRANSITION",
            `cannot move ${pos.status} → ${to}`,
            { id, from: pos.status, to },
          ),
        );
      }
      const at = Date.now();
      repo.updateStatus(id, to, at);
      repo.appendEvent({
        positionId: id,
        type: meta?.type ?? "transition",
        fromStatus: pos.status,
        toStatus: to,
        txHash: meta?.txHash,
        signer: meta?.signer,
        detail: meta?.detail,
      });
      return ok({ ...pos, status: to, updatedAt: at });
    },
  };
}
