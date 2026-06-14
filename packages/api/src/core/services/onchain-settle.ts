// onchain-settle service — bridges a position to the proven forge scripts. It
// derives order params (no hardcoded values), drives Ship/Settle, and reports a
// typed result. Dry-run safe: with no keeper key / RPC / broadcast flag it logs
// the command and returns `simulated: true` without sending anything.

import type { HedgePosition } from "../domain/position.js";
import {
  settlePeriod as forgeSettle,
  shipOrder as forgeShip,
  type SettlePeriodResult,
  type ShipOrderResult,
} from "../../onchain/forge.js";
import { deriveOrderParams } from "../../onchain/order-params.js";

export interface OnchainSettleConfig {
  /** Base RPC endpoint. Absent → dry-run. */
  rpcUrl?: string;
  /** Reserve/keeper key that signs the SHIP (maker = reserve). Absent → ship dry-run. */
  keeperKey?: `0x${string}`;
  /** Subscriber/hedger key that signs the SETTLE (the order is taker-bound to the
   *  subscriber — the reserve key would revert UnauthorizedTaker). Absent → settle dry-run. */
  subscriberKey?: `0x${string}`;
  /** The insurance reserve (order maker). Falls back to nothing → dry-run note. */
  reserve?: `0x${string}`;
  /** Master broadcast switch — must also have the right key + rpc + reserve. */
  broadcast: boolean;
}

export interface OnchainSettleService {
  /** Is real broadcasting enabled (key + rpc + reserve + flag)? */
  enabled(): boolean;
  /** Settle the current period for a position via Settle.s.sol. */
  settle(pos: HedgePosition): Promise<SettlePeriodResult>;
  /** Ship the position's order into Aqua via Ship.s.sol (reserve = maker). */
  ship(pos: HedgePosition): Promise<ShipOrderResult>;
}

export function createOnchainSettleService(
  config: OnchainSettleConfig,
): OnchainSettleService {
  const reserve = config.reserve;
  // Ship is signed by the reserve/keeper; settle by the subscriber (hedger). Gate each
  // independently so a missing subscriber key only downgrades settle to dry-run.
  const canShip = !!(config.broadcast && config.rpcUrl && config.keeperKey && reserve);
  const canSettle = !!(config.broadcast && config.rpcUrl && config.subscriberKey && reserve);
  const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

  return {
    enabled() {
      return canShip && canSettle;
    },

    async settle(pos) {
      const { notional, fixedRate, cap } = deriveOrderParams(pos);
      return forgeSettle({
        subscriber: pos.hedger,
        maker: reserve ?? ZERO,
        notional,
        fixedRate,
        cap,
        rpcUrl: config.rpcUrl,
        // SETTLE is signed by the subscriber/hedger (the bound taker), NOT the reserve.
        keeperKey: config.subscriberKey,
        broadcast: canSettle,
      });
    },

    async ship(pos) {
      const { notional, fixedRate, cap, collateralFloor } = deriveOrderParams(pos);
      return forgeShip({
        reserve: reserve ?? ZERO,
        hedger: pos.hedger,
        notional,
        // ship at least the no-default floor (cap×notional).
        collateral: collateralFloor,
        fixedRate,
        cap,
        rpcUrl: config.rpcUrl,
        // SHIP is signed by the reserve/keeper (the maker).
        keeperKey: config.keeperKey,
        broadcast: canShip,
      });
    },
  };
}
