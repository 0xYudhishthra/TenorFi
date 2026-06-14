"use client";

import { useCallback, useEffect, useState } from "react";

/* ============================================================================
   TenorFi — dependency-free wallet hook.
   Wraps the injected EIP-1193 provider (window.ethereum) directly.
   No wagmi / RainbowKit / web3modal. SSR-safe (all window access is guarded).
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

/** Minimal EIP-1193 provider surface we rely on. */
export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/** Provider getter — always SSR-safe. Returns undefined during render/SSR. */
function getProvider(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

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

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  /** True only on the client when an injected provider exists. */
  hasWallet: boolean;
  /** True when connected AND on Base mainnet. */
  isOnBase: boolean;
  connect: () => Promise<string | null>;
  switchToBase: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);

  // Detect provider + restore an already-authorized account on mount.
  useEffect(() => {
    const provider = getProvider();
    if (!provider) {
      setHasWallet(false);
      return;
    }
    setHasWallet(true);

    let cancelled = false;

    // Restore the chosen account across reloads (no prompt — silent).
    (async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (!cancelled && accounts && accounts.length > 0) {
          setAddress(accounts[0]);
        }
        const cid = await provider.request({ method: "eth_chainId" });
        if (!cancelled) setChainId(parseChainId(cid));
      } catch {
        /* silent — user simply isn't connected yet */
      }
    })();

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        setError(null);
      } else {
        setAddress(null);
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      setChainId(parseChainId(args[0]));
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      cancelled = true;
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    const provider = getProvider();
    if (!provider) {
      setError("No wallet detected. Install a browser wallet to continue.");
      return null;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const cid = await provider.request({ method: "eth_chainId" });
      setChainId(parseChainId(cid));
      const addr = accounts && accounts.length > 0 ? accounts[0] : null;
      setAddress(addr);
      return addr;
    } catch (err) {
      // EIP-1193 user-rejected error code is 4001.
      const e = err as { code?: number; message?: string };
      setError(e?.code === 4001 ? "Connection request rejected." : e?.message || "Failed to connect wallet.");
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchToBase = useCallback(async (): Promise<void> => {
    const provider = getProvider();
    if (!provider) {
      setError("No wallet detected.");
      return;
    }
    setError(null);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    } catch (err) {
      // 4902 = chain not added to the wallet → add it, then it switches.
      const e = err as { code?: number; message?: string };
      if (e?.code === 4902) {
        try {
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

  const disconnect = useCallback(() => {
    // Injected providers have no programmatic disconnect; clear local state.
    setAddress(null);
    setError(null);
  }, []);

  return {
    address,
    chainId,
    isConnecting,
    error,
    hasWallet,
    isOnBase: address !== null && chainId === BASE_CHAIN_ID,
    connect,
    switchToBase,
    disconnect,
  };
}
