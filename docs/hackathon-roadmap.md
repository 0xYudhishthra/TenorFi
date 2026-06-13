# Keel — Hackathon Execution Roadmap (8h sprint)

**Window:** 17:00 → 01:00 (submit early — treat 00:15 as the real deadline).
**Team (5):** Axel (Chainlink CRE) · Tomas (Ledger + math) · Shaun (UI + submission) · Lain (frontend) · You (contracts, backend, MCP).
**Biggest risk already retired:** the settlement core (`KeelSwap` + `FundingIndex`) is built and green (25 tests). We demo on the **tested Solidity path** — the SwapVM opcode is cut to roadmap.

---

## 0. Decisions locked at standup (do NOT relitigate)

| Decision | Choice | Why |
|---|---|---|
| Chain | **HyperEVM testnet**; local **anvil** as demo fallback | oracle source = settlement chain; anvil if testnet is flaky |
| Settlement | **Plain-Solidity `KeelSwap`** (no SwapVM opcode) | already tested; opcode is the long pole → roadmap |
| Market structure | **One matched swap** (1 hedger + 1 speculator), no AMM/LP | MVP scope; LP backstop is phase 2 |
| Accumulator | **Discrete per-period** (already built) | no time for cumulative `cumIndex` |
| Period length | **`PERIOD_SECONDS = 120`** (2 min/period compressed demo) | a multi-week hedge replays in the demo slot |
| Funding index units | **int256, 1e18, per-period fractional rate** | matches `KeelSwap`; edge converts annualized → per-period |
| Ledger | real hardware sign for **open / close / topUp**; "re-match" narrated/stubbed | "continue" + "close" are the real branches |
| CRE | must land **≥1 real on-chain write** (for the bounty); **EOA relayer** is the live-loop reliability fallback | don't let a flaky DON kill the demo loop |
| MCP | read Hyperliquid + open/settle + `propose_decision` (unsigned brink tx) | cuttable last; must not block core |

---

## 1. Critical path (the one ordering that matters)

```
DEPLOY contracts (You, first 30 min)  ──unblocks──►  everyone
        │
        ├─► Funding index on-chain (Axel: CRE → fallback relayer)
        ├─► UI reads swap state + index (Shaun + Lain)
        ├─► Ledger signs txs against deployed KeelSwap (Tomas)
        └─► MCP operates the swap (You)
                                  │
                          WIRE END-TO-END ──► live hourly settlement ──► Ledger moment ──► demo video ──► SUBMIT
```

**Nothing on-chain starts until contracts are deployed and `deployments.json` is published.** That is your first 30 minutes.

---

## 2. Integration interfaces — lock these in the standup so we parallelize cleanly

- **`packages/contracts/deployments.json`** — `{ chainId, rpc, MockUSDC, FundingIndex, KeelSwap, PERIOD_SECONDS, abis }`. Single source of truth for every other track.
- **Period numbering:** `period = floor(unixSeconds / PERIOD_SECONDS)`. Axel writes the index keyed by `period`; the contract reads it; the UI displays it. **Everyone uses this exact formula.**
- **Funding value:** annualized Hyperliquid funding → per-period 1e18 rate written to `setFundingIndex(period, value)`. Conversion happens at the edge (CRE workflow / relayer), NOT in the contract.
- **Swap state for UI:** `swaps(id)` getter + events `SwapOpened`, `Settled(swapId, period, realized, diff, amount, payer, receiver)`, `SwapClosed`. `previewSettle(id, realized)` for projections.
- **Brink flag (off-chain):** UI/MCP compute `remaining < cap × notional / 1e18` from the getter → surface the Ledger decision.
- **Ethena replay data:** historical Hyperliquid BTC funding (CSV/JSON) — Axel/You provide; Shaun consumes on a time-slider.

---

## 3. Owners & parallel tracks

### You — contracts · backend · MCP
1. **(T+0:00–0:30) Deploy.** Deploy `MockUSDC`, `FundingIndex`, `KeelSwap` to HyperEVM testnet. Write `deployments.json` + ABIs. Faucet USDC to demo wallets. **Publish to the team.**
2. **(0:30–1:15) Contract gaps.** Add `topUp(swapId, side, amount)` for the Ledger "continue" branch (+ 2–3 tests). Write a **seed script** that opens a matched demo swap with known params (hedger, speculator, notional, fixedRate, cap, period range).
3. **(1:15–3:30) Backend.** Tiny indexer/keeper (viem): fires `settle(id, period)` each compressed period, exposes swap state + settlement feed to the UI (or UI reads chain directly — prefer direct reads, keeper just triggers settle). Stand up the **EOA relayer** path so it's ready if CRE slips.
4. **(3:30–6:00) MCP.** `packages/mcp`: `get_funding`, `get_positions`, `get_swap`, `quote_fixed`, `open_swap`, `settle`, `preview_settle`, and the gated `propose_decision(swapId)` → returns the *unsigned* close/topUp tx for Tomas's Ledger to sign. **Cut to read+open+settle if time is short.**

### Axel — Chainlink CRE
1. **(0:00–0:30) Recon.** HyperEVM RPC + check CRE KeystoneForwarder availability. Get the `FundingIndex` address from You.
2. **(0:30–2:30) CRE workflow.** HTTP fetch Hyperliquid BTC funding → DON consensus → `setFundingIndex(period, value)` via the forwarder (set `onlyForwarder` to the forwarder addr). **Goal: one real on-chain write you can screenshot for the bounty.**
3. **CHECKPOINT (T+2:30):** Is CRE writing reliably? **If NO → switch the live demo loop to You's EOA relayer**, but keep the one real CRE write for the Chainlink submission. Don't burn past 3h on CRE.
4. **(2:30–4:00) Replay data + harden.** Pull historical BTC funding for the Ethena replay; hand to Shaun. Make the CRE write loop steady for the demo if it's working.

### Tomas — Ledger + math
1. **(0:00–1:00) Math verification.** Verify `KeelSwap` netting with real numbers: `net = clamp(realized − fixed, ±cap) × notional`, no-default bound `cap × notional`, brink `remaining < cap × notional`. Lock the **annualized↔per-period Δt** conversion (document it for the UI). Confirm direction: `R > F` ⇒ hedger credited (matches contract).
2. **(0:00 — in parallel) Confirm Ledger hardware is on hand + WebHID works in the browser.** If not, software-signer fallback but keep Ledger framing.
3. **(1:00–4:00) Ledger integration.** Sign `open` / `close` / `topUp` from a Ledger (ethers + `@ledgerhq/hw-app-eth` or wallet-connect with Ledger). Build the **brink scenario**: drive realized funding extreme so one side nears the floor.
4. **(4:00–6:00) Wire the Ledger moment into the UI** with Shaun: brink detected → UI surfaces close/continue → human signs on Ledger. This is WOW #4.

### Shaun + Lain — UI + submission
1. **(0:00–1:30) Scaffold + shell with MOCK data** (don't wait on deploy): Next.js + the four surfaces — **(a) Ethena replay chart (hero)**, (b) lock card (floating ticker vs fixed quote + Lock/Take buttons), (c) position + hourly-settlement feed, (d) rates board (cut first if needed).
2. **(1:30–4:00) Wire to chain** via `deployments.json`: read `swaps(id)` + events, show live settlement feed, funding index ticker. **Ethena replay** uses Axel's historical data on a slider.
3. **(4:00–6:00) Ledger moment UI** (with Tomas) + polish the hero (the two diverging lines: "Same crash. One bled $8B. One didn't feel it.").
4. **Lain** owns the Ethena replay chart end-to-end while Shaun wires the lock/settlement flow. **Shaun starts submission writeup at T+5:00** regardless of UI state.

---

## 4. Timeline & checkpoints

| Time | Milestone | Gate |
|---|---|---|
| 17:00 | **Standup** — lock §0 decisions, assign, confirm Ledger hw + HyperEVM RPC | go/no-go on chain |
| 17:30 | **Contracts deployed**, `deployments.json` published | everyone unblocked |
| 19:00 | UI shell live (mock data); CRE first write attempt; Ledger signs a test tx | — |
| 19:30 | **CRE checkpoint** — real write or fall back to relayer | live funding source decided |
| 20:00 | **End-to-end thread working**: open swap → settle a period → UI shows it | the core demo exists |
| 21:30 | Ethena replay hero + live settlement feed polished | hero locked |
| 22:30 | **Ledger moment** wired; MCP cameo working (or cut) | feature freeze approaches |
| 23:00 | **FEATURE FREEZE** — only bug-fixes on the demo path after this | — |
| 23:00–00:15 | Demo video + submission writeup + bounty applications | — |
| 00:15 | **SUBMIT** (45 min buffer for portal issues) | done |

---

## 5. Risk register & fallbacks

| Risk | Trigger | Fallback |
|---|---|---|
| CRE slow / forwarder missing on HyperEVM | not writing by 19:30 | EOA relayer posts the real API-derived index; keep 1 CRE write for the bounty |
| HyperEVM testnet down / RPC flaky | deploy fails in first 30 min | Base Sepolia, else local **anvil** for the demo (we need no EIP-1153 — plain Solidity) |
| Ledger hardware / WebHID issues | confirmed at standup | software signer, keep Ledger framing; get ≥1 real Ledger sign on video if possible |
| UI over-scoped | behind at 21:30 | ship hero (Ethena replay) + lock card + settlement feed; cut rates board |
| MCP eats core time | behind at 20:00 | cut MCP to read+open+settle, or to a roadmap mention; never block the core demo |
| Settlement reverts at brink (`InsufficientCollateral`) | by design | that's the brink — detect off-chain, surface the Ledger decision; `topUp` to continue |

---

## 6. Demo script (60–90s) — what we actually show

1. **Ethena replay (hero):** locked vs unlocked on the Oct-2025 funding crash slider — diverging lines.
2. **One-click lock:** open a swap, real tx on HyperEVM.
3. **Live hourly settlement:** compressed periods settle in USDC; funding from CRE/relayer; show pre-locked collateral → "no default possible."
4. **The Ledger moment:** drive collateral to the brink → UI surfaces close / continue → a human signs on the **Ledger**.
5. **MCP cameo (if alive):** drive Keel from Claude — agent reads Hyperliquid, opens/settles, and at the brink hands the decision to the Ledger. *Agent proposes, human disposes.*

**Be honest on screen:** the lock + settlements are real (testnet); the crash is a *replay* of real historical funding on a slider.

---

## 7. Submission checklist (Shaun, from 23:00)

- [ ] Demo video (the script above)
- [ ] Project description + the Ethena hook
- [ ] Architecture diagram (CRE → Aqua/KeelSwap → Ledger, on HyperEVM)
- [ ] Repo link + deployed addresses (`deployments.json`)
- [ ] Bounty applications: **1inch Aqua**, **Chainlink CRE** (link the real write tx), **Ledger** (confirm the prize exists)
- [ ] "Real vs scripted" note (credibility)
- [ ] Team + roles

---

## 8. Explicitly NOT building tonight

SwapVM opcode · AMM/LP imbalance backstop · cumulative accumulator · cross-chain collateral · re-match logic (narrated). All are roadmap — say so if asked.
