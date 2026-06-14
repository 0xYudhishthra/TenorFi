import { materialisers, resources, type ComposeCompileResult, type ComposeSdk, type SimulationPolicy } from "@lifi/composer-sdk";
import type { PublicClient } from "viem";
import { createKeelComposeSdk, resolveUserProxy } from "./client.js";
import { encodeKeelShipCall, KEEL_BASE } from "./keel.js";

export interface KeelOpenParams {
  /**
   * The LP / insurance reserve's signer (EOA). This flow is run BY THE LP to
   * ship coverage: its Compose proxy becomes the Aqua `maker`.
   */
  signer: `0x${string}`;
  /** USDC collateral the LP/reserve ships for the Keel leg, 6-dec base units. Fixed at compile time. */
  collateral: bigint;
  /** The hedger (the bound taker/subscriber): settles and posts zero collateral. */
  subscriber: `0x${string}`;
  /** Locked fixed funding rate (FFR), per-period in WAD. Signed. */
  fixedRate: bigint;
  /** Per-period clamp (e.g. 4e16 = 4%). */
  cap: bigint;
  /** Notional in USDC 6-dec base units. */
  notional: bigint;
  /** Settlement token. Defaults to USDC (`KEEL_BASE.usdc`). */
  settlementToken?: `0x${string}`;
  /** Override the resolved proxy/maker (skips the probe round-trip). The LP proxy = Aqua maker. */
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
 * Build + compile the Composer flow that SHIPS a Keel position on Base. This is
 * the LP-ship flow: it is run BY THE LP / insurance reserve to ship coverage.
 *
 * The flow runs on the LP's per-user Compose proxy (the `userProxy`), which
 * becomes the Aqua `maker`: it pulls a fixed USDC collateral in, approves Aqua
 * to pull it at settlement, and ships the funding-settlement order into Aqua via
 * `core.rawCall` (the order's array args can't go through the typed `core.call`,
 * so the calldata is pre-encoded off-chain). The hedger is the `subscriber` —
 * they post zero collateral and only activate the subscription separately.
 *
 * Aqua's `ship` only records the maker's virtual balance — it never pulls the
 * USDC — so the collateral must stay on the proxy for per-period settlement to
 * pull from. Composer requires every declared input to be consumed by a node, so
 * we consume the collateral with a `core.split`: its (unbound) halves become
 * residual that, with no `sweepTo`, stays on the proxy as the live Aqua balance.
 *
 * Shipping a position = a single signed transaction (`result.transactionRequest`).
 */
export async function buildKeelOpenFlow(params: KeelOpenParams): Promise<ComposeCompileResult> {
  const sdk = params.sdk ?? createKeelComposeSdk();
  const usdc = (params.usdc ?? KEEL_BASE.usdc) as `0x${string}`;

  // maker = the LP/reserve proxy (this flow is run by the LP).
  const maker =
    params.maker ??
    (await resolveUserProxy({ signer: params.signer, chainId: KEEL_BASE.chainId, token: usdc, sdk }));

  const ship = await encodeKeelShipCall({
    order: {
      maker,
      subscriber: params.subscriber,
      settlementToken: params.settlementToken,
      fixedRate: params.fixedRate,
      cap: params.cap,
      notional: params.notional,
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
