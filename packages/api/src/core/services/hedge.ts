// hedge service — builds the two onboarding legs as unsigned quotes. The API
// never signs: it returns what the user's wallet signs.
//
// LEG SPLIT (qualifies the LI.FI Composer track AND works around Composer's
// Hyperliquid limitation — Composer can't reach non-EVM HyperCore):
//   - **Base / Keel leg → LI.FI Composer** (`buildKeelOpenFlow`): a Composer flow
//     on Base that `core.rawCall`s Aqua's `ship` to open the subscription against
//     our deployed contract. Composer interacts directly with our on-chain
//     contract here — this is the Composer-track integration. One signed tx.
//   - **Hyperliquid leg → LI.FI classic** (`buildHyperCoreDeposit`): bridges USDC
//     to HyperCore via the proven `relaydepository` route. classic owns this leg.

import { classic, buildKeelOpenFlow } from "@keel/lifi";
import { createPublicClient, http, parseUnits, type PublicClient } from "viem";
import { ok, err, type Result } from "../domain/result.js";
import { keelError, type KeelError } from "../domain/errors.js";

type LifiClient = ReturnType<typeof classic.createLifiClient>;
type DepositStep = Awaited<ReturnType<typeof classic.buildHyperCoreDeposit>>;
type OpenFlow = Awaited<ReturnType<typeof buildKeelOpenFlow>>;

const USDC_DECIMALS = 6;

// Keel-leg order defaults — match the contracts' env defaults (Ship.s.sol/Settle.s.sol).
const DEFAULT_FIXED_RATE_WAD = "8333333333333"; // 7.3% APR as a per-hour 1e18 rate
const DEFAULT_CAP_WAD = "40000000000000000"; // 4e16 = 4% per-period clamp

export interface QuoteHedgeParams {
  /** Address funding both legs (the hedger). */
  fromAddress: `0x${string}`;
  /** Source chain the user funds from (where their USDC is). */
  fromChain: number;
  /** USDC to deposit as Hyperliquid perp margin, decimal string (e.g. "5"). */
  perpCollateralUsd: string;
  /** USDC collateral to lock for the Keel (Composer) leg, decimal string. */
  keelCollateralUsd: string;
  slippage?: number;
  /** Notional for the Keel leg (USDC decimal). Defaults to keelCollateralUsd. */
  notionalUsd?: string;
  /** Bound counterparty (insurance reserve). Defaults to the service's reserve. */
  counterparty?: `0x${string}`;
  /** Locked fixed rate, per-hour WAD. Defaults to 7.3% APR. */
  fixedRateWad?: string;
  /** Per-period clamp, WAD. Defaults to 4e16. */
  capWad?: string;
  /** Hedger leg direction (the hedger's downside leg is `false`). */
  makerPaysAbove?: boolean;
}

export interface HedgeQuote {
  /** Leg 1: bridge + deposit perp collateral into HyperCore (LI.FI classic). */
  deposit: DepositStep;
  /** Leg 2: Composer flow opening the Keel position on Base. Null if no reserve. */
  open: OpenFlow | null;
  /** Human-readable notes (e.g. why the open leg was skipped). */
  notes: string[];
}

export interface HedgeServiceOptions {
  /** Chain where the Keel/Aqua contracts live (Base 8453). */
  keelChain: number;
  /** The insurance reserve = the Composer open leg's bound counterparty. */
  reserve?: `0x${string}`;
  /** Base RPC for the Composer open flow's on-chain `buildProgram` read. */
  rpcUrl?: string;
  /** classic LI.FI client for the deposit leg. */
  client?: LifiClient;
}

export interface HedgeService {
  quoteHedge(params: QuoteHedgeParams): Promise<Result<HedgeQuote, KeelError>>;
}

export function createHedgeService(opts: HedgeServiceOptions): HedgeService {
  const client = opts.client ?? classic.createLifiClient();
  const publicClient: PublicClient | undefined = opts.rpcUrl
    ? (createPublicClient({ transport: http(opts.rpcUrl) }) as PublicClient)
    : undefined;

  return {
    async quoteHedge(params) {
      let perpAmount: string;
      try {
        perpAmount = parseUnits(params.perpCollateralUsd, USDC_DECIMALS).toString();
        parseUnits(params.keelCollateralUsd, USDC_DECIMALS); // validate
      } catch (cause) {
        return err(
          keelError(
            "VALIDATION_FAILED",
            "invalid USDC amount",
            {
              perpCollateralUsd: params.perpCollateralUsd,
              keelCollateralUsd: params.keelCollateralUsd,
            },
            cause,
          ),
        );
      }

      const notes: string[] = [];
      try {
        // HL leg — LI.FI classic (Composer can't reach non-EVM HyperCore).
        const deposit = await classic.buildHyperCoreDeposit({
          fromChain: params.fromChain,
          amount: perpAmount,
          fromAddress: params.fromAddress,
          slippage: params.slippage,
          client,
        });

        // Base/Keel leg — LI.FI Composer (interacts with our Aqua contract on Base).
        let open: OpenFlow | null = null;
        const counterparty = params.counterparty ?? opts.reserve;
        if (!counterparty) {
          notes.push("open leg skipped: reserve/counterparty not configured (set RESERVE_ADDRESS)");
        } else {
          open = await buildKeelOpenFlow({
            signer: params.fromAddress,
            collateral: parseUnits(params.keelCollateralUsd, USDC_DECIMALS),
            counterparty,
            fixedRate: BigInt(params.fixedRateWad ?? DEFAULT_FIXED_RATE_WAD),
            cap: BigInt(params.capWad ?? DEFAULT_CAP_WAD),
            notional: parseUnits(params.notionalUsd ?? params.keelCollateralUsd, USDC_DECIMALS),
            makerPaysAbove: params.makerPaysAbove ?? false,
            publicClient,
          });
        }

        return ok({ deposit, open, notes });
      } catch (cause) {
        return err(
          keelError(
            "QUOTE_FAILED",
            "failed to build hedge quote",
            { fromChain: params.fromChain },
            cause,
          ),
        );
      }
    },
  };
}
