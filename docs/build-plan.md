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
- **No secrets in the repo.** `.env` is git-ignored; `.env.example` documents the keys.

## Milestones

- [x] **M0 — repo skeleton.** Monorepo (pnpm workspaces), docs, gitignore, env example.
- [ ] **M1 — settlement core (Solidity).**
  - `FundingIndex` — `setFundingIndex(period, value)` storage latch, `onlyForwarder`.
  - `KeelSwap` — open a matched swap, hourly `settle()` netting fixed-vs-realized
    against pre-locked collateral, cap per period, close. No double-settle.
  - Unit tests: net cashflow math, the cap, no-default invariant, no double-settle.
- [ ] **M2 — Chainlink CRE workflow.** Read Hyperliquid funding → DON consensus →
    write the funding index on-chain (uses `chainlink-cre-skill`).
- [ ] **M3 — `_fundingSettle` SwapVM opcode.** Port the settlement math into a custom
    Aqua opcode; keep the Solidity path as fallback until validated on-chain.
- [ ] **M4 — keeper.** Hourly `settle()` trigger (and/or CRE-triggered).
- [ ] **M5 — web app.** Rates board · lock card · hourly-settlement feed · Ethena replay.
- [ ] **M6 — Arc deploy + USDC settlement.** Verify EIP-1153 (transient storage) on Arc;
    else deploy the Aqua app on an EIP-1153 chain and use Arc as the USDC settlement leg.

## Validation (already done)

Monte Carlo (`docs/research/keel_sim.py`): on a $1M position over 30d, *unlocked* funding
income swings ~40% (p5→p95); locking → std $0. Ethena-style crash (45%→4% APR): unlocked
$3,021 vs locked $16,438 → **+$13,417**. Max hourly owed *at the cap* = $411, pre-locked
per party. Fair fixed ≈ E[funding] (protocol takes no directional bet).
