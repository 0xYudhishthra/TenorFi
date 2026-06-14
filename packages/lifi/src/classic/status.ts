import { getStatus, type SDKClient } from "@lifi/sdk";
import { createLifiClient } from "./client.js";

export type BridgeStatus = "NOT_FOUND" | "PENDING" | "DONE" | "FAILED" | "INVALID";

export interface BridgeStatusParams {
  txHash: `0x${string}`;
  fromChain: number;
  toChain: number;
  /** Bridge tool used (from the quote's `tool`), e.g. "relaydepository". */
  bridge?: string;
  client?: SDKClient;
}

/**
 * Poll the status of a single in-flight deposit/bridge by source tx hash. Used by
 * the API's bridge-watcher to advance a position once funds land on HyperCore.
 */
export async function getBridgeStatus(
  params: BridgeStatusParams,
): Promise<{ status: BridgeStatus; substatus?: string }> {
  const lifi = params.client ?? createLifiClient();
  const res = await getStatus(lifi, {
    txHash: params.txHash,
    fromChain: params.fromChain,
    toChain: params.toChain,
    bridge: params.bridge,
  });
  return {
    status: res.status as BridgeStatus,
    substatus: "substatus" in res ? (res.substatus as string) : undefined,
  };
}
