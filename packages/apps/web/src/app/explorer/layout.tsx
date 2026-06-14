import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explorer — Keel",
  description:
    "Search positions, addresses, and settlement transactions on the Keel funding-rate protocol.",
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
