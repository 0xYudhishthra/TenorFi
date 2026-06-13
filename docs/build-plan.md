# Keel — Build Plan

The order we build in, and *why* in that order. Small, incremental commits. The
on-chain settlement core comes first so the demo has real behavior behind it from
day one; the Aqua opcode and CRE workflow layer on top of the same settlement math.

## Guiding decisions

- **Solidity settlement core first.** SwapVM's `swap()` is atomic with no native
  hold/expiry, so periodic settlement is the hardest piece. We build a plain-Solidity
  settlement contract that is correct and demoable on its own — this is both the honest
  fallback *and* the source of truth the `_fundingSettle` opcode wraps.
- **`_fundingSettle` opcode second.** A thin SwapVM instruction over the same math
  (read latched index → net `(realized − fixed) × notional`, capped → pull/push).
- **MVP = one matched swap** (one hedger + one speculator) + the funding index + a keeper
  firing hourly. The AMM/LP backstop for imbalance is phase 2 — mocked for the demo.
- **Everything deploys on Hyperliquid testnet (HyperEVM).** Oracle source = settlement
  chain. (Replaces the earlier Arc plan.)
- **Third pillar is Ledger, not Arc.** The collateral-low decision (close / re-match /
  continue) is signed by a human on a Ledger — the deliberate anti-agent stance. USDC
  settlement happens on HyperEVM.
- **Agent layer via MCP (in MVP scope).** A Keel MCP lets an agent read Hyperliquid and
  operate the swap (open / monitor / settle), but the brink decision is *prepared* by the
  agent and *signed* by a human on a Ledger — agent proposes, human disposes. The MCP must
  never hold the key for the brink tx. Keep the deterministic claim precise: no AI in the
  settlement math; the agent is an operating layer on top.
- **No secrets in the repo.** `.env` is git-ignored; `.env.example` documents the keys.

## First-3-hours validation gate (fail fast)

Prove the stack before building UI. Each check has a fallback:
1. **CRE → on-chain index.** Can CRE fetch Hyperliquid BTC funding via API and write the
   index to a consumer on HyperEVM testnet? **Else** → EOA relayer posts the real
   API-derived index.
2. **Custom SwapVM opcode.** Can `_fundingSettle` be written + deployed quickly on
   HyperEVM? **Else** → drop to the plain-Solidity settlement core (M1, already built) and
   move the opcode to roadmap. Confirm EIP-1153 (transient storage) support too.
3. **Settlement loop.** Can the contract read the index and transfer between two parties in
   one period? This is the core — ✅ already proven by `KeelSwap` (25 tests green).

## Two blocking math decisions (lock before M3)

Everything downstream builds on these (see design-doc §6 *Settlement math*):
1. **Simple vs compound accumulator** — discrete per-period (built) vs IPOR-style cumulative
   `cumIndex`. *Recommendation: ship discrete for the demo.*
2. **Annualized-to-period `Δt` convention** for the compressed (~2 min/period) demo —
   document it so on-screen numbers reconcile.

## Milestones

- [x] **M0 — repo skeleton.** Monorepo (pnpm workspaces), docs, gitignore, env example.
- [x] **M1 — settlement core (Solidity).** ✅ 25 tests green.
  - `FundingIndex` — `setFundingIndex(period, value)` storage latch, `onlyForwarder`.
  - `KeelSwap` — open a matched swap, hourly `settle()` netting fixed-vs-realized
    against pre-locked collateral, cap per period, close. No double-settle.
  - Unit tests: net cashflow math, the cap, no-default invariant, no double-settle.
- [ ] **M2 — Chainlink CRE workflow.** Read Hyperliquid funding → DON consensus →
    write the funding index on-chain to a consumer on HyperEVM (uses `chainlink-cre-skill`).
    Fallback: EOA relayer posting the real API-derived index. **See `docs/chainlink-cre-notes.md`.**
- [ ] **M3 — `_fundingSettle` SwapVM opcode.** Port the settlement math into a custom
    Aqua opcode; keep the Solidity path as fallback until validated on-chain. Gated by the
    two math decisions above + EIP-1153 support on HyperEVM.
- [ ] **M4 — keeper.** Hourly `settle()` trigger (and/or CRE-triggered).
- [ ] **M5 — web app.** Rates board · lock card · hourly-settlement feed · Ethena replay ·
    the **Ledger moment** (human signs close / re-match / continue at the brink).
- [ ] **M6 — HyperEVM deploy + USDC settlement.** Deploy everything on Hyperliquid testnet
    (oracle source = settlement chain). Confirm EIP-1153 (transient storage); test USDC
    (canonical vs `MockUSDC`). USDC settlement on HyperEVM.
- [ ] **M7 — Keel MCP (agent layer, the one-click front door).** MCP server that orchestrates
    **both legs** in one conversation: `list_offers` (the LP's fixed-rate offers, e.g. "5% /
    $20k coverage") → on a **Ledger** signature, `open_hyperliquid_position` (HL testnet API)
    **+** `open_keel_position` (`KeelSwap.open`). Per period: `settle` → on `AFR > FFR`,
    `topup_hyperliquid_margin` (route the payout to the perp's margin). Gated `propose_decision`
    returns the *unsigned* brink tx for the Ledger. Agent proposes, human disposes; the MCP
    never holds a signing key. (`AFR`/`FFR` = actual/fixed funding = `realized`/`fixed`.)

## Validation (already done)

Monte Carlo (`docs/research/keel_sim.py`): on a $1M position over 30d, *unlocked* funding
income swings ~40% (p5→p95); locking → std $0. Ethena-style crash (45%→4% APR): unlocked
$3,021 vs locked $16,438 → **+$13,417**. Max hourly owed *at the cap* = $411, pre-locked
per party. Fair fixed ≈ E[funding] (protocol takes no directional bet).
