import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explorer — TenorFi",
  description:
    "Search positions, addresses, and settlement transactions on the TenorFi funding-rate protocol.",
};

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
