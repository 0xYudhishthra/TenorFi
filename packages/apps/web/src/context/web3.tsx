"use client";

/* ============================================================================
   TenorFi — Web3 provider (Reown AppKit + wagmi).

   Mounted once in app/layout.tsx. Runs createAppKit (registers the modal that
   surfaces MetaMask injected + WalletConnect), then wraps the tree in
   WagmiProvider + QueryClientProvider. `cookieToInitialState` rehydrates the
   wagmi store from the SSR cookie so the first client render matches the server.
   ============================================================================ */

import React, { type ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { base } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";

import { wagmiAdapter, projectId, networks } from "@/lib/wallet";

const queryClient = new QueryClient();

const metadata = {
  name: "TenorFi",
  description: "Fixed-rate funding subscription",
  url: "https://tenorfi.up.railway.app",
  icons: ["https://tenorfi.up.railway.app/tenorfi-logo.png"],
};

// createAppKit must run on the client only (module is "use client"). It wires
// up the global modal; the <appkit-button /> web component and useAppKit() hook
// both talk to this single instance.
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: base,
  projectId,
  metadata,
  features: { analytics: false },
});

export default function Web3Provider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
