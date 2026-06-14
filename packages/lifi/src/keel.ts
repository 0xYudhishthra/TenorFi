import { createPublicClient, encodeFunctionData, http, type PublicClient } from "viem";

/**
 * Live Keel deployment on Base mainnet (packages/contracts/deployments.json).
 * Opening a Keel position is a call to Aqua's `ship` — these are the addresses
 * the Composer flow's `core.rawCall` targets.
 */
export const KEEL_BASE = {
  chainId: 8453,
  aqua: "0x499943E74FB0cE105688beeE8Ef2ABec5D936d31",
  router: "0x3a526bdb3249512580760A703248c3E0700766E9",
  program: "0x5A6f0876EDe0797ee126a32a616875862BfcF6EB",
  positionToken: "0x6514B382a2a5BaeAF5c17ab6A02c5A1fB511FfB9",
  fundingIndex: "0x545f162204A92CEbeb12AA0A4AaDF777d6905005",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  periodSeconds: 3600,
} as const;

/** Inputs to `KeelFundingProgram.buildProgram` — the maker's funding-settlement order. */
export interface KeelOrderParams {
  /** The payer/owner of this leg. With Composer this is the user's execution proxy. */
  maker: `0x${string}`;
  /** The only address allowed to take this order (the receiver of this leg). */
  counterparty: `0x${string}`;
  /** Locked fixed funding rate (FFR), per-period in WAD. Signed. */
  fixedRate: bigint;
  /** Per-period clamp (e.g. 4e16 = 4%). */
  cap: bigint;
  /** Notional in USDC 6-decimal base units. */
  notional: bigint;
  /** true: maker pays when realized > fixed; false: when realized < fixed. */
  makerPaysAbove: boolean;
  program?: `0x${string}`;
  fundingIndex?: `0x${string}`;
  periodSeconds?: bigint;
}

const BUILD_PROGRAM_ABI = [
  {
    type: "function",
    name: "buildProgram",
    stateMutability: "pure",
    inputs: [
      { name: "maker", type: "address" },
      { name: "fundingIndex", type: "address" },
      { name: "fixedRate", type: "int256" },
      { name: "cap", type: "uint256" },
      { name: "notional", type: "uint256" },
      { name: "periodSeconds", type: "uint256" },
      { name: "counterparty", type: "address" },
      { name: "makerPaysAbove", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const SHIP_ABI = [
  {
    type: "function",
    name: "ship",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

function basePublicClient(rpcUrl?: string): PublicClient {
  // No `chain` here on purpose: eth_call needs only a transport, and binding an
  // OP-stack chain widens the block/tx union into a type that doesn't match the
  // bare `PublicClient` annotation. Default RPC is Base mainnet.
  return createPublicClient({ transport: http(rpcUrl ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
}

/**
 * Build the order strategy bytes (`abi.encode(order)`) for a Keel leg by calling
 * the deployed `KeelFundingProgram.buildProgram` (a pure function) and taking its
 * raw return data. For a single struct return the raw return bytes equal
 * `abi.encode(order)` — exactly what Aqua's `ship` expects as `strategy`.
 */
export async function buildKeelOrderStrategy(
  params: KeelOrderParams,
  publicClient: PublicClient = basePublicClient(),
): Promise<`0x${string}`> {
  const program = params.program ?? KEEL_BASE.program;
  const data = encodeFunctionData({
    abi: BUILD_PROGRAM_ABI,
    functionName: "buildProgram",
    args: [
      params.maker,
      params.fundingIndex ?? KEEL_BASE.fundingIndex,
      params.fixedRate,
      params.cap,
      params.notional,
      params.periodSeconds ?? BigInt(KEEL_BASE.periodSeconds),
      params.counterparty,
      params.makerPaysAbove,
    ],
  });
  const res = await publicClient.call({ to: program, data });
  if (!res.data || res.data === "0x") throw new Error("buildProgram returned empty data");
  return res.data;
}

export interface KeelShipCall {
  /** Aqua address — the `core.rawCall` target. */
  target: `0x${string}`;
  /** Pre-encoded `ship(...)` calldata for `core.rawCall`. */
  calldata: `0x${string}`;
  /** The order strategy bytes (also the Aqua strategy key input). */
  strategy: `0x${string}`;
}

/**
 * Encode the full Aqua `ship` call that opens a Keel leg: ships the strategy with
 * {positionToken, USDC} balances. `collateral` is fixed at compile time (see the
 * design notes — `core.rawCall` calldata is static), so the proxy must hold at
 * least `collateral` USDC with an Aqua allowance for settlement to pull later.
 */
export async function encodeKeelShipCall(params: {
  order: KeelOrderParams;
  /** USDC collateral (6-dec base units) declared for this leg. */
  collateral: bigint;
  /** Position-marker amount (tokenIn, amountIn 0 at settlement). Defaults to 1e18. */
  positionAmount?: bigint;
  router?: `0x${string}`;
  positionToken?: `0x${string}`;
  usdc?: `0x${string}`;
  publicClient?: PublicClient;
}): Promise<KeelShipCall> {
  const strategy = await buildKeelOrderStrategy(params.order, params.publicClient);
  const router = params.router ?? KEEL_BASE.router;
  const positionToken = params.positionToken ?? KEEL_BASE.positionToken;
  const usdc = params.usdc ?? KEEL_BASE.usdc;
  const positionAmount = params.positionAmount ?? 10n ** 18n;

  const calldata = encodeFunctionData({
    abi: SHIP_ABI,
    functionName: "ship",
    args: [router, strategy, [positionToken, usdc], [positionAmount, params.collateral]],
  });

  return { target: KEEL_BASE.aqua, calldata, strategy };
}

/** Mintable position-marker ABI (POS is a free, valueless ERC-20 marker). */
export const POSITION_TOKEN_MINT_SIG =
  "function mint(address to, uint256 amount)" as const;
