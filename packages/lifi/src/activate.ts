import {
  materialisers,
  resources,
  type ComposeCompileResult,
  type ComposeSdk,
  type SimulationPolicy,
} from "@lifi/composer-sdk";
import { createKeelComposeSdk } from "./client.js";
import { KEEL_BASE } from "./keel.js";

/**
 * Default USDC allowance the hedger brings + approves to Aqua so the premium can
 * be pulled across periods (1,000,000 USDC in 6-dec base units — large relative
 * to any realistic per-period premium, while still a sane `directDeposit`).
 *
 * NOTE: `core.approve` has no fixed-amount config (it only takes `spender`); the
 * approved amount is the bound resource amount, i.e. the deposited input. So the
 * allowance also drives the materialised input amount — they cannot diverge.
 */
const DEFAULT_ALLOWANCE = 1_000_000_000_000n;

export interface KeelActivateParams {
  /**
   * The hedger's signer (EOA). This flow is run BY THE HEDGER to "activate the
   * subscription": its Compose proxy approves Aqua so the premium can be pulled.
   * The hedger does NOT ship — it posts zero collateral.
   */
  signer: `0x${string}`;
  /**
   * USDC allowance to grant Aqua (so the premium can be pulled), in 6-dec base
   * units. Defaults to {@link DEFAULT_ALLOWANCE}. Also drives the deposited input
   * amount (see the note above — `core.approve` ties the two together).
   */
  allowance?: bigint;
  /** Settlement / premium token to approve. Defaults to USDC (`KEEL_BASE.usdc`). */
  usdc?: `0x${string}`;
  /** Aqua address — the approval spender. Defaults to `KEEL_BASE.aqua`. */
  aqua?: `0x${string}`;
  simulationPolicy?: SimulationPolicy;
  sdk?: ComposeSdk;
}

/**
 * Build + compile the Composer flow the HEDGER runs to activate their
 * subscription. The hedger never ships coverage (that's the LP's flow); they
 * only approve Aqua to pull the premium from their proxy's USDC at settlement.
 *
 * The flow runs on the hedger's per-user Compose proxy: it brings a small USDC
 * input, `core.approve`s Aqua as the spender (mode:copy, so the USDC resource is
 * not consumed and stays on the proxy), then consumes the declared input with a
 * `core.split` whose (unbound) halves — with no `sweepTo` — remain on the proxy.
 *
 * Activating = a single signed transaction (`result.transactionRequest`).
 */
export async function buildKeelActivateFlow(params: KeelActivateParams): Promise<ComposeCompileResult> {
  const sdk = params.sdk ?? createKeelComposeSdk();
  const usdc = (params.usdc ?? KEEL_BASE.usdc) as `0x${string}`;
  const aqua = (params.aqua ?? KEEL_BASE.aqua) as `0x${string}`;
  const allowance = params.allowance ?? DEFAULT_ALLOWANCE;

  const builder = sdk.flow(KEEL_BASE.chainId, {
    name: "keel-activate",
    inputs: { allowance: resources.erc20(usdc, KEEL_BASE.chainId) },
  });

  // Approve Aqua to pull the premium at settlement. `core.approve` is mode:copy,
  // so the USDC resource is not consumed and remains on the proxy afterwards.
  builder.core.approve("approve-usdc", {
    bind: { amount: builder.inputs.allowance },
    config: { spender: aqua },
  });

  // Consume the declared input (Composer requires it) without moving it off the
  // proxy: split it and leave both halves unbound. With no sweepTo they stay on
  // the proxy as the hedger's USDC backing the approval.
  builder.core.split("keep-balance", {
    bind: { source: builder.inputs.allowance },
    config: { bps: 5000 },
  });

  // No sweepTo: the USDC stays on the proxy; the approval lets Aqua pull the premium.
  return builder.compile({
    inputs: { allowance: materialisers.directDeposit({ amount: allowance }) },
    signer: params.signer,
    simulationPolicy: params.simulationPolicy,
  });
}
