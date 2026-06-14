"use client";

import { useWallet, truncateAddress } from "@/lib/wallet";

/**
 * Wallet connect button for the top nav.
 * States: no-wallet → install link · disconnected → "Connect Wallet" ·
 * connected + wrong chain → "Switch to Base" · connected + Base → truncated address.
 */
export default function ConnectWallet() {
  const { address, isConnecting, hasWallet, isOnBase, connect, switchToBase } = useWallet();

  // No injected wallet — point the user at MetaMask.
  if (!hasWallet) {
    return (
      <a
        href="https://metamask.io"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost btn-sm"
        title="No wallet detected — install one to connect"
      >
        Install a wallet
      </a>
    );
  }

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

  // Connected on Base.
  return (
    <span className="btn btn-ghost btn-sm mono" title={address} style={{ cursor: "default" }}>
      <span className="badge badge-up" style={{ height: 22, padding: "0 8px", fontSize: 11 }}>
        <span className="dot" />
      </span>
      {truncateAddress(address)}
    </span>
  );
}
