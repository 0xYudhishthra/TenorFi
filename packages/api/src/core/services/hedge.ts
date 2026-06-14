// hedge service — builds the two LI.FI legs of the onboarding hedge as unsigned
// quotes. The API never signs: it prepares transactionRequests the user's wallet
// signs. Deposit leg works today; the open leg needs the deployed KeelSwap target.

// The HyperCore deposit path lives in the @lifi/sdk-v4 "classic" build (Composer
// can't reach non-EVM HyperCore). Exposed under the `classic` namespace.
import { classic } from "@keel/lifi";
import { parseUnits } from "viem";
import { ok, err, type Result } from "../domain/result.js";
import { keelError, type KeelError } from "../domain/errors.js";

type LifiClient = ReturnType<typeof classic.createLifiClient>;
type DepositStep = Awaited<ReturnType<typeof classic.buildHyperCoreDeposit>>;
type OpenStep = Awaited<ReturnType<typeof classic.buildOpenCall>>;

const USDC_DECIMALS = 6;

export interface QuoteHedgeParams {
  /** Address funding both legs (the hedger). */
  fromAddress: `0x${string}`;
  /** Source chain the user funds from (where their USDC is). */
  fromChain: number;
  /** USDC to deposit as Hyperliquid perp margin, as a decimal string (e.g. "5"). */
  perpCollateralUsd: string;
  /** USDC to lock as Keel-swap collateral, as a decimal string. */
  keelCollateralUsd: string;
  slippage?: number;
  /** ABI-encoded KeelSwap.open(...) calldata. Until present, the open leg is skipped. */
  keelCallData?: `0x${string}`;
}

export interface HedgeQuote {
  /** Leg 1: bridge + deposit perp collateral into HyperCore. Always built. */
  deposit: DepositStep;
  /** Leg 2: bridge + call KeelSwap.open on the Keel chain. Null until the contract is wired. */
  open: OpenStep | null;
  /** Human-readable notes (e.g. why the open leg was skipped). */
  notes: string[];
}

export interface HedgeServiceOptions {
  /** Chain where KeelSwap lives (e.g. Base 8453). */
  keelChain: number;
  /** KeelSwap address; undefined until the contract is deployed. */
  keelTarget?: `0x${string}`;
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
      let keelAmount: string;
      try {
        perpAmount = parseUnits(params.perpCollateralUsd, USDC_DECIMALS).toString();
        keelAmount = parseUnits(params.keelCollateralUsd, USDC_DECIMALS).toString();
      } catch (cause) {
        return err(
          keelError("VALIDATION_FAILED", "invalid USDC amount", {
            perpCollateralUsd: params.perpCollateralUsd,
            keelCollateralUsd: params.keelCollateralUsd,
          }, cause),
        );
      }

      const notes: string[] = [];
      try {
        const deposit = await classic.buildHyperCoreDeposit({
          fromChain: params.fromChain,
          amount: perpAmount,
          fromAddress: params.fromAddress,
          slippage: params.slippage,
          client,
        });

        let open: OpenStep | null = null;
        if (!opts.keelTarget) {
          notes.push("open leg skipped: KEELSWAP_ADDRESS_BASE not configured");
        } else if (!params.keelCallData) {
          notes.push("open leg skipped: keelCallData not provided");
        } else {
          open = await classic.buildOpenCall({
            fromChain: params.fromChain,
            amount: keelAmount,
            fromAddress: params.fromAddress,
            toChain: opts.keelChain,
            target: opts.keelTarget,
            callData: params.keelCallData,
            slippage: params.slippage,
            client,
          });
        }

        return ok({ deposit, open, notes });
      } catch (cause) {
        return err(
          keelError("QUOTE_FAILED", "failed to build hedge quote", {
            fromChain: params.fromChain,
          }, cause),
        );
      }
    },
  };
}
