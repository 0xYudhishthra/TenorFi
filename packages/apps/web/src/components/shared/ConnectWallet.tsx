"use client";

import { useWallet, truncateAddress } from "@/lib/wallet";

/**
 * Wallet connect button for the top nav (WalletConnect).
 * States: disconnected → "Connect Wallet" (opens WC QR modal) ·
 * connected + wrong chain → "Switch to Base" · connected + Base → truncated
 * address with a Disconnect affordance (WC sessions persist across reloads).
 */
export default function ConnectWallet() {
  const { address, isConnecting, isOnBase, connect, switchToBase, disconnect } = useWallet();

  // Disconnected.
  if (!address) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={connect} disabled={isConnecting}>
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  // Connected but on the wrong network.
  if (!isOnBase) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={switchToBase} title="Wrong network">
        <span className="badge badge-clay" style={{ height: 22, padding: "0 8px", fontSize: 11 }}>
          <span className="dot" /> Switch to Base
        </span>
      </button>
    );
  }

  // Connected on Base. Click to disconnect (WalletConnect session persists).
  return (
    <button
      className="btn btn-ghost btn-sm mono"
      title={`${address} · click to disconnect`}
      onClick={disconnect}
    >
      <span className="badge badge-up" style={{ height: 22, padding: "0 8px", fontSize: 11 }}>
        <span className="dot" />
      </span>
      {truncateAddress(address)}
    </button>
  );
}
