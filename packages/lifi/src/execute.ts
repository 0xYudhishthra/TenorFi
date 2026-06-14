import type { ComposeCompileResult } from "@lifi/composer-sdk";
import type { WalletClient } from "viem";
import type { HedgeFlows } from "./hedge.js";

export type HedgeLeg = "keel" | "perp";
export type LegStatus = "approving" | "submitting" | "submitted";

export interface HedgeProgress {
  leg: HedgeLeg;
  status: LegStatus;
  txHash?: `0x${string}`;
}

export interface ExecuteHedgeOptions {
  /** viem wallet client for the hedger, configured on the flow's chain (Base). */
  wallet: WalletClient;
  /** Per-step progress callback. */
  onProgress?: (p: HedgeProgress) => void;
}

export interface HedgeExecution {
  keelTxHash: `0x${string}`;
  perpTxHash: `0x${string}`;
}

/**
 * Submit both compiled Composer legs: grant any required ERC-20 approvals, then
 * send each flow's `transactionRequest`. Both run on Base, so one wallet signs
 * both. The Hyperliquid perp order is placed separately via the HL API after the
 * perp margin bridges across — not handled here.
 *
 * Sends real transactions (needs funds + the live Keel deployment).
 */
export async function executeHedge(
  flows: HedgeFlows,
  opts: ExecuteHedgeOptions,
): Promise<HedgeExecution> {
  const keelTxHash = await executeLeg("keel", flows.keel, opts);
  const perpTxHash = await executeLeg("perp", flows.perp, opts);
  return { keelTxHash, perpTxHash };
}

async function executeLeg(
  leg: HedgeLeg,
  result: ComposeCompileResult,
  opts: ExecuteHedgeOptions,
): Promise<`0x${string}`> {
  if (result.status !== "success") {
    const detail = result.status === "partial" ? `: ${result.error.message}` : "";
    throw new Error(`leg ${leg}: compile not successful (${result.status})${detail}`);
  }

  const account = opts.wallet.account;
  if (!account) throw new Error("wallet client has no account");
  const chain = opts.wallet.chain;

  for (const approval of result.approvals ?? []) {
    opts.onProgress?.({ leg, status: "approving" });
    await opts.wallet.sendTransaction({
      account,
      chain,
      to: approval.transactionRequest.to as `0x${string}`,
      data: approval.transactionRequest.data as `0x${string}`,
      value: BigInt(approval.transactionRequest.value),
    });
  }

  opts.onProgress?.({ leg, status: "submitting" });
  const req = result.transactionRequest;
  const txHash = await opts.wallet.sendTransaction({
    account,
    chain,
    to: req.to as `0x${string}`,
    data: req.data as `0x${string}`,
    value: BigInt(req.value),
    gas: req.gasLimit !== undefined ? BigInt(req.gasLimit) : undefined,
  });
  opts.onProgress?.({ leg, status: "submitted", txHash });
  return txHash;
}
