import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import Web3Provider from "@/context/web3";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";

// Fonts are self-hosted with plain @font-face in globals.css, served from
// /public/fonts/*.woff2 — no next/font, no build-time fetch, no hashed classes.

export const metadata: Metadata = {
  title: "TenorFi — Lock Your Funding Rate",
  description: "On-chain fixed funding-rate positions. Your collateral never goes idle.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/tenorfi-logo.png", type: "image/png" },
    ],
    apple: "/favicon.ico",
  },
  openGraph: {
    title: "TenorFi — Lock Your Funding Rate",
    description: "On-chain fixed funding-rate positions. Your collateral never goes idle.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the request cookie so the wagmi store can be rehydrated on the client
  // with the same state the server saw (clean SSR hydration). headers() is
  // synchronous in Next 14.
  const cookies = headers().get("cookie");

  return (
    <html lang="en">
      <body className="antialiased">
        <Web3Provider cookies={cookies}>
          <Header />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </Web3Provider>
      </body>
    </html>
  );
}
