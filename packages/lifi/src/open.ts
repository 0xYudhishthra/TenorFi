import { materialisers, resources, type ComposeCompileResult, type ComposeSdk, type SimulationPolicy } from "@lifi/composer-sdk";
import type { PublicClient } from "viem";
import { createKeelComposeSdk, resolveUserProxy } from "./client.js";
import { encodeKeelShipCall, KEEL_BASE } from "./keel.js";

export interface KeelOpenParams {
  /** The hedger's signer (EOA). Its Compose proxy becomes the Aqua maker. */
  signer: `0x${string}`;
  /** USDC collateral to lock for the Keel leg, 6-dec base units. Fixed at compile time. */
  collateral: bigint;
  /** The bound counterparty for this leg (the insurance reserve). */
  counterparty: `0x${string}`;
  /** Locked fixed funding rate (FFR), per-period in WAD. Signed. */
  fixedRate: bigint;
  /** Per-period clamp (e.g. 4e16 = 4%). */
  cap: bigint;
  /** Notional in USDC 6-dec base units. */
  notional: bigint;
  /**
   * true: maker (the hedger here) pays when realized > fixed; false: pays when
   * realized < fixed. The hedger's downside leg is `false` (hedger pays the
   * reserve the premium when funding stays calm).
   */
  makerPaysAbove?: boolean;
  /** Override the resolved proxy/maker (skips the probe round-trip). */
  maker?: `0x${string}`;
  periodSeconds?: bigint;
  program?: `0x${string}`;
  fundingIndex?: `0x${string}`;
  router?: `0x${string}`;
  positionToken?: `0x${string}`;
  usdc?: `0x${string}`;
  simulationPolicy?: SimulationPolicy;
  publicClient?: PublicClient;
  sdk?: ComposeSdk;
}

/**
 * Build + compile the Composer flow that opens a Keel position on Base.
 *
 * The flow runs on the hedger's per-user Compose proxy (the `userProxy`): it
 * pulls a fixed USDC collateral in, approves Aqua to pull it at settlement, and
 * ships the funding-settlement order into Aqua via `core.rawCall` (the order's
 * array args can't go through the typed `core.call`, so the calldata is
 * pre-encoded off-chain).
 *
 * Aqua's `ship` only records the maker's virtual balance — it never pulls the
 * USDC — so the collateral must stay on the proxy for per-period settlement to
 * pull from. Composer requires every declared input to be consumed by a node, so
 * we consume the collateral with a `core.split`: its (unbound) halves become
 * residual that, with no `sweepTo`, stays on the proxy as the live Aqua balance.
 *
 * Opening a position = a single signed transaction (`result.transactionRequest`).
 */
export async function buildKeelOpenFlow(params: KeelOpenParams): Promise<ComposeCompileResult> {
  const sdk = params.sdk ?? createKeelComposeSdk();
  const usdc = (params.usdc ?? KEEL_BASE.usdc) as `0x${string}`;

  const maker =
    params.maker ??
    (await resolveUserProxy({ signer: params.signer, chainId: KEEL_BASE.chainId, token: usdc, sdk }));

  const ship = await encodeKeelShipCall({
    order: {
      maker,
      counterparty: params.counterparty,
      fixedRate: params.fixedRate,
      cap: params.cap,
      notional: params.notional,
      makerPaysAbove: params.makerPaysAbove ?? false,
      program: params.program,
      fundingIndex: params.fundingIndex,
      periodSeconds: params.periodSeconds,
    },
    collateral: params.collateral,
    router: params.router,
    positionToken: params.positionToken,
    usdc,
    publicClient: params.publicClient,
  });

  const builder = sdk.flow(KEEL_BASE.chainId, {
    name: "keel-open",
    inputs: { collateral: resources.erc20(usdc, KEEL_BASE.chainId) },
  });

  // Approve Aqua to pull the collateral at settlement. `core.approve` is mode:copy,
  // so the USDC resource is not consumed and remains on the proxy afterwards.
  builder.core.approve("approve-usdc", {
    bind: { amount: builder.inputs.collateral },
    config: { spender: KEEL_BASE.aqua },
  });

  // Ship the order into Aqua. Pre-encoded because ship takes address[]/uint256[].
  builder.core.rawCall("ship", {
    bind: {},
    config: { target: ship.target, calldata: ship.calldata, callType: "Call" },
  });

  // Consume the collateral input (Composer requires it) without moving it off the
  // proxy: split it and leave both halves unbound. With no sweepTo they remain on
  // the proxy as the USDC backing the Aqua virtual balance.
  builder.core.split("keep-collateral", {
    bind: { source: builder.inputs.collateral },
    config: { bps: 5000 },
  });

  // No sweepTo: the collateral USDC stays on the proxy as the Aqua virtual balance.
  return builder.compile({
    inputs: { collateral: materialisers.directDeposit({ amount: params.collateral }) },
    signer: params.signer,
    simulationPolicy: params.simulationPolicy,
  });
}
