"use client";

import { useAppKit } from "@reown/appkit/react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { truncateAddress, BASE_CHAIN_ID } from "@/lib/wallet";

/**
 * Wallet connect button for the top nav (Reown AppKit + wagmi).
 *
 * States:
 *  - disconnected → "Connect Wallet" opens the AppKit modal, which lists the
 *    installed browser wallet (MetaMask injected) AND WalletConnect (QR/mobile).
 *  - connected + wrong chain → "Switch to Base" (wagmi useSwitchChain).
 *  - connected + Base → truncated address; click reopens the AppKit modal
 *    (account view, where the user can disconnect/switch).
 */
export default function ConnectWallet() {
  const { open } = useAppKit();
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isOnBase = chainId === BASE_CHAIN_ID;

  // Disconnected.
  if (!isConnected || !address) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => open()}
        disabled={isConnecting}
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  // Connected but on the wrong network.
  if (!isOnBase) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
        title="Wrong network"
      >
        <span
          className="badge badge-clay"
          style={{ height: 22, padding: "0 8px", fontSize: 11 }}
        >
          <span className="dot" /> Switch to Base
        </span>
      </button>
    );
  }

  // Connected on Base. Click opens the AppKit account modal (disconnect/switch).
  return (
    <button
      className="btn btn-ghost btn-sm mono"
      title={`${address} · click to manage`}
      onClick={() => open()}
    >
      <span
        className="badge badge-up"
        style={{ height: 22, padding: "0 8px", fontSize: 11 }}
      >
        <span className="dot" />
      </span>
      {truncateAddress(address)}
    </button>
  );
}
