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
  /** Reserve/keeper key that signs ship+settle. Absent → dry-run. */
  keeperKey?: `0x${string}`;
  /** The insurance reserve (order maker). Falls back to nothing → dry-run note. */
  reserve?: `0x${string}`;
  /** Master broadcast switch — must also have key+rpc. */
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
  const broadcast = !!(config.broadcast && config.rpcUrl && config.keeperKey && reserve);

  return {
    enabled() {
      return broadcast;
    },

    async settle(pos) {
      const { notional, fixedRate, cap } = deriveOrderParams(pos);
      return forgeSettle({
        subscriber: pos.hedger,
        // maker = the reserve. In dry-run reserve may be undefined → echo a placeholder.
        maker: reserve ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`),
        notional,
        fixedRate,
        cap,
        rpcUrl: config.rpcUrl,
        keeperKey: config.keeperKey,
        broadcast,
      });
    },

    async ship(pos) {
      const { notional, fixedRate, cap, collateralFloor } = deriveOrderParams(pos);
      return forgeShip({
        reserve: reserve ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`),
        hedger: pos.hedger,
        notional,
        // ship at least the no-default floor (cap×notional).
        collateral: collateralFloor,
        fixedRate,
        cap,
        rpcUrl: config.rpcUrl,
        keeperKey: config.keeperKey,
        broadcast,
      });
    },
  };
}
