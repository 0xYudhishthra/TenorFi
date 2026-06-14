/* ============================================================================
   TenorFi — wallet config (Reown AppKit + wagmi adapter, Base mainnet only).

   This module holds the SSR-safe wagmi/AppKit configuration plus the small
   display helpers the rest of the app imports (truncateAddress, BASE_CHAIN_ID).
   The AppKit modal lists installed browser wallets (MetaMask injected) AND
   WalletConnect (QR / mobile) — see src/context/web3.tsx where createAppKit runs.

   Storage uses cookieStorage so wagmi state survives SSR hydration cleanly
   (the cookie is read in app/layout.tsx and passed to the provider).
   ============================================================================ */

import { cookieStorage, createStorage } from "@wagmi/core";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { base } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

/** Base mainnet. Kept exported — consumers (create-position) read this. */
export const BASE_CHAIN_ID = 8453;

/** Shorten an address for display: 0x1234…abcd */
export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

if (!projectId) {
  // Non-fatal: surfaced loudly in dev. The connect button still renders; the
  // modal will report the missing projectId. Free at https://cloud.reown.com.
  // eslint-disable-next-line no-console
  console.warn(
    "[TenorFi] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — wallet connect will not work. Get one free at https://cloud.reown.com.",
  );
}

/** Base only — TenorFi settles on Base mainnet. */
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [base];

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
});

export const config = wagmiAdapter.wagmiConfig;
