import type { Metadata } from "next";
import "./globals.css";
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
      { url: "/tenorfi_logo.png", type: "image/png" },
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
  return (
    <html lang="en">
      <body className="antialiased">
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
