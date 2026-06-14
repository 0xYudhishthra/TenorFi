import { getStatus, type SDKClient } from "@lifi/sdk";
import type { WalletClient } from "viem";
import { createLifiClient } from "./client.js";
import type { HedgeQuotes } from "./hedge.js";

export type HedgeStep = "deposit" | "open";
export type HedgeStatus = "submitting" | "submitted" | "bridging" | "done";

export interface HedgeProgress {
  step: HedgeStep;
  status: HedgeStatus;
  txHash?: `0x${string}`;
}

export interface ExecuteHedgeOptions {
  /** viem wallet client for the hedger (configured on the source chain). */
  wallet: WalletClient;
  /** Per-step progress callback (the "estado por paso"). */
  onProgress?: (p: HedgeProgress) => void;
  /** Bridge-status poll interval (ms). Default 5000. */
  pollMs?: number;
  /** Max bridge-status polls before giving up. Default 60 (~5 min at 5s). */
  maxPolls?: number;
  client?: SDKClient;
}

export interface HedgeExecution {
  depositTxHash: `0x${string}`;
  openTxHash: `0x${string}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute both hedge legs in order, signing with `wallet` and reporting progress
 * per step: deposit collateral into HyperCore, then bridge + open the Keel swap.
 *
 * NOT validated on-chain yet — executing sends real transactions (needs funds +
 * a deployed KeelSwap). Each leg signs the LI.FI `transactionRequest` on the source
 * chain; the bridge to the destination is then polled via getStatus until DONE.
 */
export async function executeHedge(
  quotes: HedgeQuotes,
  opts: ExecuteHedgeOptions,
): Promise<HedgeExecution> {
  const lifi = opts.client ?? createLifiClient();
  const depositTxHash = await executeLeg("deposit", quotes.deposit, opts, lifi);
  const openTxHash = await executeLeg("open", quotes.open, opts, lifi);
  return { depositTxHash, openTxHash };
}

async function executeLeg(
  step: HedgeStep,
  quote: HedgeQuotes["deposit"],
  opts: ExecuteHedgeOptions,
  lifi: SDKClient,
): Promise<`0x${string}`> {
  const req = quote.transactionRequest;
  if (!req?.to) throw new Error(`leg ${step}: quote has no transactionRequest`);
  const account = opts.wallet.account;
  if (!account) throw new Error("wallet client has no account");

  opts.onProgress?.({ step, status: "submitting" });
  const txHash = await opts.wallet.sendTransaction({
    account,
    chain: opts.wallet.chain,
    to: req.to as `0x${string}`,
    data: req.data as `0x${string}` | undefined,
    value: req.value !== undefined ? BigInt(req.value) : undefined,
    gas: req.gasLimit !== undefined ? BigInt(req.gasLimit) : undefined,
    gasPrice: req.gasPrice !== undefined ? BigInt(req.gasPrice) : undefined,
  });
  opts.onProgress?.({ step, status: "submitted", txHash });

  // Poll the bridge until funds land on the destination chain.
  opts.onProgress?.({ step, status: "bridging", txHash });
  const pollMs = opts.pollMs ?? 5000;
  const maxPolls = opts.maxPolls ?? 60;
  for (let i = 0; i < maxPolls; i++) {
    const res = await getStatus(lifi, {
      txHash,
      fromChain: quote.action.fromChainId,
      toChain: quote.action.toChainId,
      bridge: quote.tool,
    });
    if (res.status === "DONE") {
      opts.onProgress?.({ step, status: "done", txHash });
      return txHash;
    }
    if (res.status === "FAILED" || res.status === "INVALID") {
      throw new Error(`leg ${step}: bridge ${res.status}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`leg ${step}: bridge still pending after ${maxPolls} polls`);
}
