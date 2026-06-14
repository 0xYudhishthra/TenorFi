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

export type EventListener = (event: PositionEvent) => void;

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
  /** Append a timeline event without a state change (e.g. an execution result). */
  note(
    positionId: string,
    meta: { type: string; txHash?: string; signer?: string; detail?: unknown },
  ): PositionEvent;
  /** Subscribe to a position's live events. Returns an unsubscribe fn. */
  subscribe(positionId: string, listener: EventListener): () => void;
}

export function createPositionService(repo: PositionRepo): PositionService {
  const listeners = new Map<string, Set<EventListener>>();

  function publish(event: PositionEvent) {
    const set = listeners.get(event.positionId);
    if (set) for (const l of set) l(event);
  }

  return {
    openHedge(input) {
      const pos = repo.create({ ...input, status: "DRAFT" });
      publish(repo.appendEvent({ positionId: pos.id, type: "created", toStatus: "DRAFT" }));
      // We already hold a quote, so advance to QUOTED immediately.
      repo.updateStatus(pos.id, "QUOTED", Date.now());
      publish(
        repo.appendEvent({
          positionId: pos.id,
          type: "transition",
          fromStatus: "DRAFT",
          toStatus: "QUOTED",
        }),
      );
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
      publish(
        repo.appendEvent({
          positionId: id,
          type: meta?.type ?? "transition",
          fromStatus: pos.status,
          toStatus: to,
          txHash: meta?.txHash,
          signer: meta?.signer,
          detail: meta?.detail,
        }),
      );
      return ok({ ...pos, status: to, updatedAt: at });
    },

    note(positionId, meta) {
      const event = repo.appendEvent({
        positionId,
        type: meta.type,
        txHash: meta.txHash,
        signer: meta.signer,
        detail: meta.detail,
      });
      publish(event);
      return event;
    },

    subscribe(positionId, listener) {
      let set = listeners.get(positionId);
      if (!set) {
        set = new Set();
        listeners.set(positionId, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set && set.size === 0) listeners.delete(positionId);
      };
    },
  };
}
