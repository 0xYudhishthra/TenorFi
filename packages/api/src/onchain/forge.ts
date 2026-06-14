// forge — drives the PROVEN forge scripts (Ship.s.sol / Settle.s.sol) in
// packages/contracts via node:child_process. We do NOT re-implement TakerTraits
// encoding in viem: the scripts already rebuild the exact shipped order through
// TenorFundingProgram.buildProgram(...) and call TenorSwapVMRouter.swap(...).
//
// Dry-run by default: with no keeper key / RPC / broadcast flag, NOTHING is sent.
// We build the command, log it, and return `simulated: true`. Real broadcasts are
// gated behind `broadcast` (config: KEEPER_PRIVATE_KEY + BASE_RPC_URL +
// SETTLE_BROADCAST=true). We never fabricate a tx hash — `txHash` is only set when
// forge actually broadcasts and prints one.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Resolve packages/contracts relative to this file (…/api/src/onchain/forge.ts). */
const CONTRACTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../contracts",
);

export type SettleDirection = "coverage" | "premium" | "none";

export interface SettlePeriodInput {
  /** The subscriber wallet (bound taker) — settles the current period. */
  subscriber: `0x${string}`;
  /** The insurance reserve (order maker / MAKER). */
  maker: `0x${string}`;
  /** Swap notional, in USDC base units (1e6). */
  notional: bigint;
  /** Fixed leg rate, per-hour in WAD (1e18). */
  fixedRate: bigint;
  /** Per-period clamp on the net, in WAD (1e18). */
  cap: bigint;
  /** Base RPC endpoint. Required to broadcast; in dry-run it is only echoed. */
  rpcUrl?: string;
  /** The keeper/subscriber key that signs the settle. Required to broadcast. */
  keeperKey?: `0x${string}`;
  /** Only true → real broadcast. Default false → dry-run. */
  broadcast?: boolean;
}

export interface SettlePeriodResult {
  ok: boolean;
  /** True when no tx was broadcast (dry-run) — economics still parsed if available. */
  simulated: boolean;
  /** block.timestamp / 3600 for the settled period, if the script logged it. */
  period: number | null;
  /** Realized funding R for the period (WAD 1e18), if logged. */
  realized: bigint | null;
  /** Which leg settled. "none" → R == F (nothing to settle). */
  direction: SettleDirection;
  /** Coverage paid (R>F) or premium pulled (R<F), in USDC base units (1e6). */
  amountUsdc: bigint;
  /** Only present when a real broadcast emitted a tx hash. NEVER fabricated. */
  txHash?: `0x${string}`;
  /** The exact command we ran/would run (key is redacted). */
  command: string;
  /** Populated on failure or dry-run note. */
  error?: string;
}

export interface ShipOrderInput {
  /** The insurance reserve wallet (order maker, and the signer). */
  reserve: `0x${string}`;
  /** The bound counterparty (subscriber/hedger) the order is taker-bound to. */
  hedger: `0x${string}`;
  /** Swap notional, in USDC base units (1e6). */
  notional: bigint;
  /** USDC collateral to ship, in base units (1e6). Must be ≥ cap×notional/1e18. */
  collateral: bigint;
  /** Fixed leg rate, per-hour in WAD (1e18). */
  fixedRate: bigint;
  /** Per-period clamp, in WAD (1e18). */
  cap: bigint;
  rpcUrl?: string;
  /** The reserve key that signs the ship. Required to broadcast. */
  keeperKey?: `0x${string}`;
  broadcast?: boolean;
}

export interface ShipOrderResult {
  ok: boolean;
  simulated: boolean;
  /** Only present when a real broadcast emitted a tx hash. NEVER fabricated. */
  txHash?: `0x${string}`;
  command: string;
  error?: string;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Spawn `forge script` in packages/contracts. Resolves (never rejects) on exit. */
function runForge(args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn("forge", args, {
        cwd: CONTRACTS_DIR,
        env: { ...process.env, ...env },
      });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: e instanceof Error ? e.message : String(e) });
      return;
    }
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: stderr + "\n" + e.message }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** A loggable command string with the private key redacted. */
function describeCommand(
  script: string,
  envKeys: Record<string, string>,
  rpcUrl: string | undefined,
  broadcast: boolean,
): string {
  const safe = { ...envKeys, PRIVATE_KEY: "0x<redacted>" };
  const envStr = Object.entries(safe)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const flags = [
    rpcUrl ? `--rpc-url ${rpcUrl}` : "",
    broadcast ? "--broadcast" : "(dry-run, no --broadcast)",
  ]
    .filter(Boolean)
    .join(" ");
  return `(cd packages/contracts && ${envStr} forge script ${script} ${flags})`;
}

/** Decide whether a real broadcast can happen. */
function canBroadcast(input: { rpcUrl?: string; keeperKey?: `0x${string}`; broadcast?: boolean }): boolean {
  return !!(input.broadcast && input.rpcUrl && input.keeperKey);
}

/** Parse the first `0x…64` tx hash forge prints after a broadcast. */
function parseTxHash(stdout: string): `0x${string}` | undefined {
  const m = stdout.match(/(?:Hash|transactionHash)[:\s]+(0x[0-9a-fA-F]{64})/);
  if (m) return m[1] as `0x${string}`;
  const any = stdout.match(/\b(0x[0-9a-fA-F]{64})\b/);
  return any ? (any[1] as `0x${string}`) : undefined;
}

function parseBigIntAfter(stdout: string, label: string): bigint | null {
  // console2.log("label:", n) renders as "label: <n>" (n may be negative).
  const re = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(-?\\d+)`);
  const m = stdout.match(re);
  return m ? BigInt(m[1]) : null;
}

/**
 * Settle the CURRENT period for one subscription by running Settle.s.sol.
 * Returns a typed result; never throws. On non-zero exit, `ok: false` + `error`.
 */
export async function settlePeriod(input: SettlePeriodInput): Promise<SettlePeriodResult> {
  const broadcast = canBroadcast(input);
  const envKeys: Record<string, string> = {
    MAKER: input.maker,
    NOTIONAL: input.notional.toString(),
    FIXED_RATE: input.fixedRate.toString(),
    CAP: input.cap.toString(),
  };
  const command = describeCommand(
    "script/Settle.s.sol:Settle",
    envKeys,
    input.rpcUrl,
    broadcast,
  );

  if (!broadcast) {
    // DRY-RUN: do not run forge against mainnet without a key/RPC. Log + simulate.
    console.log(`[onchain:settle] DRY-RUN (no broadcast): ${command}`);
    return {
      ok: true,
      simulated: true,
      period: null,
      realized: null,
      direction: "none",
      amountUsdc: 0n,
      command,
      error:
        "dry-run: KEEPER_PRIVATE_KEY/BASE_RPC_URL absent or SETTLE_BROADCAST!=true",
    };
  }

  const args = [
    "script",
    "script/Settle.s.sol:Settle",
    "--rpc-url",
    input.rpcUrl!,
    "--broadcast",
  ];
  const env: NodeJS.ProcessEnv = {
    ...envKeys,
    PRIVATE_KEY: input.keeperKey!,
  };
  const { code, stdout, stderr } = await runForge(args, env);

  if (code !== 0) {
    return {
      ok: false,
      simulated: false,
      period: null,
      realized: null,
      direction: "none",
      amountUsdc: 0n,
      command,
      error: `forge exited ${code}: ${stderr.trim() || stdout.trim()}`.slice(0, 2000),
    };
  }

  const period = parseBigIntAfter(stdout, "period:");
  const realized = parseBigIntAfter(stdout, "realized R \\(1e18\\):");
  const coverage = parseBigIntAfter(stdout, "coverage paid to subscriber \\(USDC 1e6\\):");
  const premium = parseBigIntAfter(stdout, "premium pulled from subscriber wallet \\(USDC 1e6\\):");

  let direction: SettleDirection = "none";
  let amountUsdc = 0n;
  if (coverage !== null) {
    direction = "coverage";
    amountUsdc = coverage;
  } else if (premium !== null) {
    direction = "premium";
    amountUsdc = premium;
  }

  return {
    ok: true,
    simulated: false,
    period: period === null ? null : Number(period),
    realized,
    direction,
    amountUsdc,
    txHash: parseTxHash(stdout),
    command,
  };
}

/**
 * Ship a subscription order into Aqua by running Ship.s.sol (reserve = signer,
 * hedger = the connected subscriber). Used by the Lock/onboarding path.
 * Returns a typed result; never throws.
 */
export async function shipOrder(input: ShipOrderInput): Promise<ShipOrderResult> {
  const broadcast = canBroadcast(input);
  const envKeys: Record<string, string> = {
    HEDGER: input.hedger,
    NOTIONAL: input.notional.toString(),
    COLLATERAL: input.collateral.toString(),
    FIXED_RATE: input.fixedRate.toString(),
    CAP: input.cap.toString(),
  };
  const command = describeCommand(
    "script/Ship.s.sol:Ship",
    envKeys,
    input.rpcUrl,
    broadcast,
  );

  if (!broadcast) {
    console.log(`[onchain:ship] DRY-RUN (no broadcast): ${command}`);
    return {
      ok: true,
      simulated: true,
      command,
      error:
        "dry-run: KEEPER_PRIVATE_KEY/BASE_RPC_URL absent or SETTLE_BROADCAST!=true",
    };
  }

  const args = [
    "script",
    "script/Ship.s.sol:Ship",
    "--rpc-url",
    input.rpcUrl!,
    "--broadcast",
  ];
  const env: NodeJS.ProcessEnv = {
    ...envKeys,
    PRIVATE_KEY: input.keeperKey!,
  };
  const { code, stdout, stderr } = await runForge(args, env);

  if (code !== 0) {
    return {
      ok: false,
      simulated: false,
      command,
      error: `forge exited ${code}: ${stderr.trim() || stdout.trim()}`.slice(0, 2000),
    };
  }

  return {
    ok: true,
    simulated: false,
    txHash: parseTxHash(stdout),
    command,
  };
}
