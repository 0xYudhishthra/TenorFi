"use client";

import { useCallback, useEffect, useState } from "react";
import type EthereumProvider from "@walletconnect/ethereum-provider";

/* ============================================================================
   TenorFi — WalletConnect wallet hook.
   Built on @walletconnect/ethereum-provider, which exposes an EIP-1193-compatible
   provider. The QR modal ships with the provider (showQrModal: true) — no extra
   UI dependency. SSR-safe: the provider is only ever initialised inside effects
   and event handlers, never during render/SSR.
   ============================================================================ */

/** Base mainnet. */
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105"; // 8453

const BASE_PARAMS = {
  chainId: BASE_CHAIN_ID_HEX,
  chainName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
};

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

/** Shorten an address for display: 0x1234…abcd */
export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function parseChainId(raw: unknown): number | null {
  if (typeof raw === "string") {
    const n = parseInt(raw, 16);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof raw === "number") return raw;
  return null;
}

/* ----------------------------------------------------------------------------
   Lazy, cached WalletConnect provider.
   EthereumProvider.init() touches window/indexedDB, so it must NEVER run during
   SSR. Callers (effects, event handlers) are always client-side.
   ---------------------------------------------------------------------------- */
let providerPromise: Promise<EthereumProvider> | null = null;

async function getProvider(): Promise<EthereumProvider> {
  if (typeof window === "undefined") {
    throw new Error("WalletConnect provider is only available in the browser.");
  }
  if (!WC_PROJECT_ID) {
    throw new Error(
      "WalletConnect projectId missing. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (free at https://cloud.reown.com).",
    );
  }
  if (!providerPromise) {
    // Dynamic import keeps the WC bundle out of the SSR/render path entirely.
    providerPromise = import("@walletconnect/ethereum-provider").then(({ default: EthereumProvider }) =>
      EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        chains: [BASE_CHAIN_ID],
        optionalChains: [BASE_CHAIN_ID],
        showQrModal: true,
        metadata: {
          name: "TenorFi",
          description: "Fixed-rate funding subscription",
          url: "https://tenorfi.up.railway.app",
          icons: ["https://tenorfi.up.railway.app/tenorfi-logo.png"],
        },
      }),
    );
  }
  return providerPromise;
}

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  /** Always true — WalletConnect needs no injected wallet. Kept for callers. */
  hasWallet: boolean;
  /** True when connected AND on Base mainnet. */
  isOnBase: boolean;
  connect: () => Promise<string | null>;
  switchToBase: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore an existing WalletConnect session on mount and wire up listeners.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // Handlers are declared here so cleanup can remove the exact references.
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        setError(null);
      } else {
        setAddress(null);
      }
    };
    const handleChainChanged = (cid: string) => {
      setChainId(parseChainId(cid));
    };
    const handleDisconnect = () => {
      setAddress(null);
      setChainId(null);
    };

    let provider: EthereumProvider | null = null;

    (async () => {
      try {
        provider = await getProvider();
        if (cancelled) return;

        // If a session already exists, surface the connected account silently.
        if (provider.session && provider.accounts && provider.accounts.length > 0) {
          setAddress(provider.accounts[0]);
          setChainId(parseChainId(provider.chainId));
        }

        provider.on("accountsChanged", handleAccountsChanged);
        provider.on("chainChanged", handleChainChanged);
        provider.on("disconnect", handleDisconnect);
      } catch {
        /* No projectId / init failure — surfaced on explicit connect() instead. */
      }
    })();

    return () => {
      cancelled = true;
      if (provider) {
        provider.removeListener("accountsChanged", handleAccountsChanged);
        provider.removeListener("chainChanged", handleChainChanged);
        provider.removeListener("disconnect", handleDisconnect);
      }
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    setIsConnecting(true);
    setError(null);
    try {
      const provider = await getProvider();
      // Opens the WalletConnect QR modal (showQrModal: true) and resolves once
      // the wallet approves the session.
      await provider.connect();
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      const cid = await provider.request({ method: "eth_chainId" });
      setChainId(parseChainId(cid));
      const addr = accounts && accounts.length > 0 ? accounts[0] : null;
      setAddress(addr);
      return addr;
    } catch (err) {
      // EIP-1193 user-rejected error code is 4001.
      const e = err as { code?: number; message?: string };
      setError(
        e?.code === 4001
          ? "Connection request rejected."
          : e?.message || "Failed to connect wallet.",
      );
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchToBase = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const provider = await getProvider();
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    } catch (err) {
      // 4902 = chain not added to the wallet → add it, then it switches.
      const e = err as { code?: number; message?: string };
      if (e?.code === 4902) {
        try {
          const provider = await getProvider();
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [BASE_PARAMS],
          });
        } catch (addErr) {
          const ae = addErr as { message?: string };
          setError(ae?.message || "Failed to add Base network.");
        }
      } else if (e?.code === 4001) {
        setError("Network switch rejected.");
      } else {
        setError(e?.message || "Failed to switch to Base.");
      }
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      const provider = await getProvider();
      await provider.disconnect();
    } catch {
      /* If there's no live session, just clear local state below. */
    } finally {
      setAddress(null);
      setChainId(null);
      setError(null);
    }
  }, []);

  return {
    address,
    chainId,
    isConnecting,
    error,
    hasWallet: true,
    isOnBase: address !== null && chainId === BASE_CHAIN_ID,
    connect,
    switchToBase,
    disconnect,
  };
}
