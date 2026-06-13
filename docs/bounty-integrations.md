# Keel — Bounty Integrations (ETHGlobal NY 2026)

> How each sponsor tech is integrated and **why it's load-bearing, not a bolt-on.**
> **The test every integration must pass:** *pull it out and the product breaks.* Judges
> reward integrations that are essential and concrete; they penalise cosmetic add-ons.

## Summary

| Bounty | Prize | Status | Load-bearing? | Pull it → |
|---|---|---|---|---|
| **1inch — Build an Aqua App** | $5,000 | **Primary** | ✅ | no settlement venue / no Aqua-native swap |
| **Chainlink — Best workflow with CRE** | $6,000 | **Primary** | ✅ | no funding number → nothing to settle |
| **Ledger — AI Agents × Ledger** | $10,000 | **Primary** | ✅ | the brink decision is unguarded (anti-agent thesis dies) |
| LI.FI — Composer (Agentic Workflows) | $4,000 | Stretch | ⚠️ | cross-chain collateral onboarding (nice-to-have) |
| Hyperliquid / HyperEVM | TBD | Deploy target | ✅ | oracle source = settlement chain |
| Dynamic / Privy — agent wallets | ~$2k | Optional | ⚠️ | MCP signing UX (substitutable) |
| ~~Arc — Advanced Stablecoin Logic~~ | $3,250 | **Dropped** | — | replaced by HyperEVM (see §why-not-Arc) |

**Primary stack = $21k**, all three genuinely required. *"Pull any one and the product breaks."*

---

## 1inch — Build an Aqua App ($5,000) — PRIMARY
**What we build:** a custom **SwapVM instruction `_fundingSettle`** that turns a swap into a
funding-rate settlement: it computes `net = clamp(R − F, ±cap) × N` and sets
`ctx.swap.amountOut = net`, so SwapVM's router delivers the netted difference from the payer
(maker) to the receiver (taker). Registered in our own SwapVM (extends `AquaOpcodes`, appends the
opcode to `_opcodes()`). Built in `packages/swapvm` from `swap-vm-template`.

**Why it's a good integration (not a bolt-on):**
- The swap **literally executes as our opcode** — Aqua/SwapVM *is* the settlement engine, not a
  wrapper around it.
- A **funding-rate swap is a novel "sophisticated DeFi position"** — a derivative, not another
  AMM/lending clone. "Define your own instruction" is exactly the invited use.
- **Collateral stays alive** via Aqua virtual balances (the real edge vs Strips/IPOR locking it dead).
- **SwapVM is scored higher** — and we use it for real, with a custom instruction.

**Qualification checklist:** onchain token transfer in the demo (local fork OK) ✓ · proper git
commit history (no single-commit final day) ✓ (M0→M1b→… incremental) · SwapVM used ✓ ·
demonstrated via tests/scripts/UI ✓.

**Fallbacks (same math):** `KeelSwap` (plain Solidity, 25 tests) · `KeelFundingApp` (Aqua app,
pull-based). If the opcode doesn't land, we still submit the Aqua app + present the opcode design.

## Chainlink — Best workflow with CRE ($6,000, up to 3×$2k) — PRIMARY
**What we build:** a CRE workflow that reads BTC funding from the **Hyperliquid API**, reaches DON
consensus, and writes it on-chain via `FundingIndex.setFundingIndex(period, value)` (KeystoneForwarder).
See `docs/chainlink-cre-notes.md`.

**Why it's a good integration:**
- **There is no on-chain funding-rate oracle.** Without CRE there is literally **no number to
  settle against** — it is the most load-bearing piece in the stack.
- It's the canonical CRE shape: **external API → DON consensus → on-chain state change**
  (`setFundingIndex`), not a frontend reading a feed.
- The index is consumed by **three** parts of the system — `KeelSwap`, the `_fundingSettle`
  opcode, and the MCP's `get_funding` — so it's wired through the whole product.

**Qualification checklist:** CRE workflow as orchestration layer ✓ · integrates a blockchain with
an external API (Hyperliquid) ✓ · successful CRE CLI simulation (they deploy it live for you) —
**land ≥1 real on-chain write** ✓ · makes an on-chain state change (not a UI read) ✓.

**Fallback:** EOA relayer posts the real API-derived index if the DON is flaky — but keep ≥1 real
CRE write for the submission.

## Ledger — AI Agents × Ledger ($10,000) — PRIMARY
**What we build:** the MCP agent operates the protocol end-to-end (read funding, open both legs,
settle), but **every action that commits capital is signed on a Ledger** — trade entry and,
critically, the **brink decision** (close / top-up / re-match when collateral runs low). *Agent
proposes, human disposes.*

**Why it's a good integration:**
- **Device-backed security is central**, not branding: the one transaction that moves real money
  at the edge is **physically gated behind a hardware signature** — the MCP never holds that key.
- **Clear boundary between autonomous behaviour and explicit approval** — exactly the Ledger ask
  ("human-in-the-loop workflows for sensitive actions").
- **Concrete Ledger primitives** (EIP-712 / tx signing from the device), not wallet branding.
- The **anti-agent thesis dies without it** — pull Ledger and the "human makes the decision that
  matters" story collapses.

**Qualification checklist:** real user value (not a chatbot wrapper) ✓ · concrete Ledger primitives ✓ ·
clear autonomous/approval boundary ✓ · practical demo showing why device-backed trust matters ✓ ·
**include written feedback on Ledger docs/SDKs** (gaps, confusing flows, suggested PRs) — *deliverable
requirement, assign to Tomas.*

---

## Stretch / optional

**LI.FI — Composer ($4,000, Agentic Workflows track).** A Composer Flow that onboards collateral
cross-chain into the swap in one atomic flow (and/or the MCP uses Composer as its execution layer).
Good fit for "agentic workflows," but cross-chain onboarding is a nice-to-have, not core → stretch.

**Hyperliquid / HyperEVM.** Our deploy target — oracle source *and* settlement chain are the same
venue. Load-bearing for the product; check for a HyperEVM ecosystem prize on the day.

**Dynamic / Privy — agent wallets (~$2k).** The MCP agent needs a wallet + signing; Dynamic server
wallets / Privy agent wallet could power that (Dynamic "Best Agentic Build", Privy "Best AI agent").
Optional — substitutable, and it must not dilute the Ledger story (Ledger signs the brink, full stop).

## Why not Arc (dropped)
Arc's "Advanced Stablecoin Logic" ($3,250) fits our multi-step hourly USDC settlement, but we chose
**HyperEVM** so the funding source and settlement chain are one venue. Re-add only if we also deploy
the USDC settlement leg on Arc with time to spare — otherwise it's a bolt-on and we skip it.

## Honesty rules (say these on stage)
- **Never claim "first"** — Rho is live (see design-doc §12). We compete on Aqua-native execution +
  live collateral + the Ledger anti-agent angle + the Ethena demo.
- **Real vs scripted:** the lock + USDC settlements are real (testnet); the Ethena crash is a
  *replay* of real historical funding on a slider.
