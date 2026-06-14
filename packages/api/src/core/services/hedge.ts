// hedge service — builds the two onboarding legs as unsigned quotes. The API
// never signs: it returns what the user's wallet signs.
//
// The hedger is the SUBSCRIBER (the bound taker): it posts ZERO collateral and
// never ships. Shipping coverage is the LP/reserve's job (a separate LP-ship
// Composer flow, `buildKeelOpenFlow`, NOT part of /hedge). The hedger's /hedge
// quote is therefore:
//   - **Hyperliquid leg → LI.FI classic** (`buildHyperCoreDeposit`): bridges USDC
//     to HyperCore via the proven `relaydepository` route. classic owns this leg.
//   - **Base / Keel leg → LI.FI Composer ACTIVATE** (`buildKeelActivateFlow`): a
//     Composer flow on Base that `core.approve`s Aqua so the premium can be pulled
//     — the hedger's only on-chain Composer touch. One signed tx. NO ship.

import { classic, buildKeelActivateFlow } from "@keel/lifi";
import { parseUnits } from "viem";
import { ok, err, type Result } from "../domain/result.js";
import { keelError, type KeelError } from "../domain/errors.js";

type LifiClient = ReturnType<typeof classic.createLifiClient>;
type DepositStep = Awaited<ReturnType<typeof classic.buildHyperCoreDeposit>>;
type ActivateFlow = Awaited<ReturnType<typeof buildKeelActivateFlow>>;

const USDC_DECIMALS = 6;

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
  /** USDC allowance the hedger approves to Aqua (decimal). Defaults to the flow's large default. */
  allowanceUsd?: string;
}

export interface HedgeQuote {
  /** Leg 1: bridge + deposit perp collateral into HyperCore (LI.FI classic). */
  deposit: DepositStep;
  /**
   * Leg 2: Composer ACTIVATE flow — the hedger approves Aqua so the premium can
   * be pulled (NO ship). Field kept as `open` for API/web consumer compatibility.
   */
  open: ActivateFlow | null;
  /** Human-readable notes. */
  notes: string[];
}

export interface HedgeServiceOptions {
  /** Chain where the Keel/Aqua contracts live (Base 8453). */
  keelChain: number;
  /** classic LI.FI client for the deposit leg. */
  client?: LifiClient;
}

export interface HedgeService {
  quoteHedge(params: QuoteHedgeParams): Promise<Result<HedgeQuote, KeelError>>;
}

export function createHedgeService(opts: HedgeServiceOptions): HedgeService {
  const client = opts.client ?? classic.createLifiClient();

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

        // Base/Keel leg — LI.FI Composer ACTIVATE. The hedger is the subscriber:
        // it does NOT ship; it only approves Aqua so the premium can be pulled.
        const open: ActivateFlow = await buildKeelActivateFlow({
          signer: params.fromAddress,
          allowance: params.allowanceUsd ? parseUnits(params.allowanceUsd, USDC_DECIMALS) : undefined,
        });

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
