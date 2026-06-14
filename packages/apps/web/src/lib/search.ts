// Smart search classifier for the Keel explorer.
// Mirrors how Etherscan / Solscan / Basescan auto-detect the kind of query
// (address vs. transaction vs. block) and route to the right results page.

export type SearchKind = "swap" | "address" | "tx" | "unknown";

export interface SearchResult {
  kind: SearchKind;
  /** Normalized value (lower-cased for hashes/addresses, trimmed). */
  value: string;
  /** Destination route, or null when the query can't be resolved. */
  href: string | null;
  /** Human label for the detected kind, for inline hints. */
  label: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const SWAP_ID_RE = /^#?\d+$/;

/**
 * Classify a raw search query into a swap id, an address, a transaction hash,
 * or unknown — and return the route to navigate to.
 */
export function classifySearch(raw: string): SearchResult {
  const q = raw.trim();

  if (q === "") {
    return { kind: "unknown", value: q, href: null, label: "" };
  }

  if (SWAP_ID_RE.test(q)) {
    const id = q.replace(/^#/, "");
    return {
      kind: "swap",
      value: id,
      href: `/explorer/${id}`,
      label: "Swap ID",
    };
  }

  if (TX_HASH_RE.test(q)) {
    const value = q.toLowerCase();
    return {
      kind: "tx",
      value,
      href: `/explorer/tx/${value}`,
      label: "Transaction",
    };
  }

  if (ADDRESS_RE.test(q)) {
    const value = q.toLowerCase();
    return {
      kind: "address",
      value,
      href: `/explorer/address/${value}`,
      label: "Address",
    };
  }

  return { kind: "unknown", value: q, href: null, label: "" };
}
