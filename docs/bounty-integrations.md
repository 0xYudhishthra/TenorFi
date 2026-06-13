# Keel — Bounty Integrations (ETHGlobal NY 2026)

> How each sponsor tech is integrated and **why it's load-bearing, not a bolt-on.**
> **The test every integration must pass:** *pull it out and the product breaks.*
> **Target bounties: 1inch · Chainlink · LI.FI.** (Everything else is out of scope.)

## Summary

| Bounty | Prize | Load-bearing? | Pull it → |
|---|---|---|---|
| **1inch — Build an Aqua App** | $5,000 | ✅ | no settlement venue / no Aqua-native swap |
| **Chainlink — Best workflow with CRE** | $6,000 | ✅ | no funding number → nothing to settle |
| **LI.FI — Composer** | $4,000 | ✅ | no cross-chain way to fund + open the hedge |

Deploy chain: **Ethereum Sepolia.** Funding data source: **Hyperliquid** (read by CRE).

---

## 1inch — Build an Aqua App ($5,000)
**What we build:** a custom **SwapVM instruction `_fundingSettle`** that turns a swap into a
funding-rate settlement — it computes `net = clamp(R − F, ±cap) × N` and sets
`ctx.swap.amountOut = net`, so the router delivers the netted difference from the payer (maker) to
the receiver (taker). Registered in our own router (`KeelSwapVMRouter`, extends `AquaOpcodes`,
appends the opcode). Built in `packages/swapvm`.

**Why it's load-bearing:**
- The swap **literally executes as our opcode** — Aqua/SwapVM *is* the settlement engine.
- A funding-rate swap is a novel "sophisticated DeFi position" (a derivative), not another AMM.
- **Collateral stays alive** via Aqua virtual balances.
- **SwapVM is scored higher** — and we use it for real, with a custom instruction.

**Status: ✅ built + tested** — 5 tests incl. an e2e where the opcode moves real USDC via Aqua.
**Qualification:** onchain token transfer in the demo (local fork OK) ✓ · proper incremental git
history ✓ · SwapVM used ✓ · demonstrated via tests ✓. Fallback: `KeelSwap` (plain Solidity, 25 tests).

## Chainlink — Best workflow with CRE ($6,000, up to 3×$2k)
**What we build:** a CRE workflow that reads BTC funding from the **Hyperliquid API**, reaches DON
consensus, and writes it on-chain via `FundingIndex.setFundingIndex(period, value)`. See
`docs/chainlink-cre-notes.md`.

**Why it's load-bearing:**
- **There is no on-chain funding-rate oracle** — without CRE there is no number to settle against.
- Canonical CRE shape: **external API → DON consensus → on-chain state change** (not a UI read).
- The index is consumed by `KeelSwap`, the `_fundingSettle` opcode, and the MCP's `get_funding`.

**Qualification:** CRE workflow as orchestration layer ✓ · external API (Hyperliquid) ✓ · CRE CLI
simulation (they deploy it live for you) — land ≥1 real on-chain write ✓ · on-chain state change ✓.
**Fallback:** EOA relayer posts the real API-derived index if the DON is flaky — keep ≥1 real CRE write.

## LI.FI — Composer ($4,000)
**What we build:** cross-chain collateral onboarding — a hedger funds and opens the position with
USDC from any chain in a single LI.FI Composer flow, and/or the MCP uses Composer as its execution
layer (Agentic Workflows track). *(Owned by the integration lead — see the LI.FI section of the
design doc.)*

**Why it's load-bearing:**
- A hedger's capital is rarely already on the settlement chain; without LI.FI, funding the hedge is
  a manual multi-step bridge — LI.FI makes it one click.
- Composer as the MCP's execution layer composes the multi-step open (bridge in → approve → open)
  atomically, which fits the Agentic Workflows track.

## Honesty rules (say these on stage)
- **Never claim "first"** — Rho is live (see design-doc §12). We compete on Aqua-native execution +
  live collateral + the Ethena demo.
- **Real vs scripted:** the lock + USDC settlements are real (testnet); the Ethena crash is a
  *replay* of real historical funding on a slider.
