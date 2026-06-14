# Keel — Hackathon Execution Roadmap (8h sprint)

> ⚠️ **Historical** — this is the original 8h sprint plan and is **not** the current state. Superseded by
> [`flows.md`](flows.md) (canonical flow), [`design-doc.md`](design-doc.md), and [`pitch.md`](pitch.md).
> Ledger and the old demo script below are **no longer part of the project**; settlement is **Aqua-only**
> (the custodial `KeelSwap` was removed); the deploy target is **Base mainnet** (the Aqua layer is
> deployed + Basescan-verified); the custom SwapVM opcode is built (38 tests, Slither + adversarial audit).
> Kept for the record.

**Window:** 17:00 → 01:00 (submit early — treat 00:15 as the real deadline).
**Team (4):** Axel (Chainlink CRE) · Tomas (Ledger + math) · Shaun (MCP + submission) · You (contracts, backend, integration).
**Biggest risk already retired:** the settlement core (`KeelSwap` + `FundingIndex`) is built and green (25 tests). We demo on the **tested Solidity path** — the SwapVM opcode is cut to roadmap.
**Pivot:** MCP-first demo (agent-driven interaction) instead of UI. The MCP is the primary interface showing "agent proposes, human disposes."

---

## 0. Decisions locked at standup (do NOT relitigate)

| Decision | Choice | Why |
|---|---|---|
| Chain | **Base mainnet**; local **anvil** as demo fallback | CRE bridges Hyperliquid funding on-chain, so settlement need not host the source; anvil if testnet is flaky |
| Settlement | **Plain-Solidity `KeelSwap`** (no SwapVM opcode) | already tested; opcode is the long pole → roadmap |
| Market structure | **One matched swap** (1 hedger + 1 speculator), no AMM/LP | MVP scope; LP backstop is phase 2 |
| Accumulator | **Discrete per-period** (already built) | no time for cumulative `cumIndex` |
| Period length | **`PERIOD_SECONDS = 120`** (2 min/period compressed demo) | a multi-week hedge replays in the demo slot |
| Funding index units | **int256, 1e18, per-period fractional rate** | matches `KeelSwap`; edge converts annualized → per-period |
| Ledger | real hardware sign for **open / close / topUp**; "re-match" narrated/stubbed | "continue" + "close" are the real branches |
| CRE | must land **≥1 real on-chain write** (for the bounty); **EOA relayer** is the live-loop reliability fallback | don't let a flaky DON kill the demo loop |
| MCP | **PRIMARY DEMO INTERFACE** — conversational agent drives Hyperliquid + Keel swap, gates brink decision to Ledger | the hero; simple web chat interface for fallback if MCP flaky |

---

## 1. Critical path (the one ordering that matters)

```
DEPLOY contracts (You, first 30 min)  ──unblocks──►  everyone
        │
        ├─► Funding index on-chain (Axel: CRE → fallback relayer)
        ├─► MCP server + tools (Shaun: read Hyperliquid, open/settle swap, propose_decision)
        ├─► Ledger signs txs against deployed KeelSwap (Tomas)
        └─► Backend/keeper fires settle each period (You)
                                  │
                          WIRE END-TO-END ──► MCP drives swap via conversation ──► Ledger moment ──► demo video ──► SUBMIT
                                  │
                     (fallback: simple web chat if MCP flaky)
```

**Nothing on-chain starts until contracts are deployed and `deployments.json` is published.** That is your first 30 minutes.

---

## 2. Integration interfaces — lock these in the standup so we parallelize cleanly

- **`packages/contracts/deployments.json`** — `{ chainId, rpc, MockUSDC, FundingIndex, KeelSwap, PERIOD_SECONDS, abis }`. Single source of truth for every other track.
- **Period numbering:** `period = floor(unixSeconds / PERIOD_SECONDS)`. Axel writes the index keyed by `period`; the contract reads it; the MCP displays it. **Everyone uses this exact formula.**
- **Funding value:** annualized Hyperliquid funding → per-period 1e18 rate written to `setFundingIndex(period, value)`. Conversion happens at the edge (CRE workflow / relayer), NOT in the contract.
- **Swap state for MCP:** `swaps(id)` getter + events `SwapOpened`, `Settled(swapId, period, realized, diff, amount, payer, receiver)`, `SwapClosed`. `previewSettle(id, realized)` for projections.
- **Brink flag (off-chain):** MCP computes `remaining < cap × notional / 1e18` from the getter → surface the Ledger decision.
- **Ethena replay data:** historical Hyperliquid BTC funding (CSV/JSON) — Axel/You provide; used in demo narrative/comparison.
- **MCP tool signatures:** `get_funding(market)`, `list_offers()`, `get_position(address)`, `open_hyperliquid_position(market, side, size)`, `open_keel_position(offerId)`, `settle(swapId, period)`, `topup_hyperliquid_margin(positionId, amount)`, `propose_decision(swapId)` → returns unsigned tx for Ledger.

---

## 3. Owners & parallel tracks

### You — contracts · backend · integration
1. **(T+0:00–0:30) Deploy.** Deploy `MockUSDC`, `FundingIndex`, `KeelFundingReceiver`, `KeelSwap` to Base mainnet (real funds/gas — fund the deployer EOA with ETH first). Write `deployments.json` + ABIs. Mint `MockUSDC` to demo wallets. **Publish to the team.**
2. **(0:30–1:15) Contract gaps.** Add `topUp(swapId, side, amount)` for the Ledger "continue" branch (+ 2–3 tests). Write a **seed script** that opens a matched demo swap with known params (hedger, speculator, notional, fixedRate, cap, period range).
3. **(1:15–3:30) Backend/keeper.** Tiny indexer/keeper (viem): fires `settle(id, period)` each compressed period (120s), exposes swap state via simple REST API or direct chain reads for MCP. Stand up the **EOA relayer** path so it's ready if CRE slips.
4. **(3:30–6:00) Integration support.** Help Shaun wire MCP tools to contracts, provide Hyperliquid testnet API integration guidance, ensure settlement loop + Ledger signing paths work end-to-end. Build simple web chat fallback if MCP integration hits blockers.

### Axel — Chainlink CRE
1. **(0:00–0:30) Recon.** Base mainnet RPC + check CRE KeystoneForwarder availability. Get the `FundingIndex` address from You.
2. **(0:30–2:30) CRE workflow.** HTTP fetch Hyperliquid BTC funding → DON consensus → KeystoneForwarder → `KeelFundingReceiver.onReport` → `setFundingIndex(period, value)` (the receiver is the index's `forwarder`; `writeReport` targets the receiver). **Goal: one real on-chain write you can screenshot for the bounty.**
3. **CHECKPOINT (T+2:30):** Is CRE writing reliably? **If NO → switch the live demo loop to You's EOA relayer**, but keep the one real CRE write for the Chainlink submission. Don't burn past 3h on CRE.
4. **(2:30–4:00) Replay data + harden.** Pull historical BTC funding for the Ethena replay; hand to Shaun. Make the CRE write loop steady for the demo if it's working.

### Tomas — Ledger + math
1. **(0:00–1:00) Math verification.** Verify `KeelSwap` netting with real numbers: `net = clamp(realized − fixed, ±cap) × notional`, no-default bound `cap × notional`, brink `remaining < cap × notional`. Lock the **annualized↔per-period Δt** conversion (document for the team). Confirm direction: `R > F` ⇒ hedger credited (matches contract).
2. **(0:00 — in parallel) Confirm Ledger hardware is on hand + signing library works.** Test with ethers + `@ledgerhq/hw-app-eth` or Ledger SDK. If hardware issues, software-signer fallback but keep Ledger framing.
3. **(1:00–4:00) Ledger signing integration.** Build signing flow for `open` / `close` / `topUp` transactions. Create helper functions that MCP can call to get user signatures. Build the **brink scenario**: drive realized funding extreme so one side nears the floor.
4. **(4:00–6:00) Wire the Ledger moment with Shaun's MCP:** brink detected → MCP calls `propose_decision` → presents unsigned tx options (close/continue) → human signs on Ledger → MCP submits signed tx. This is WOW #4.

### Shaun — MCP + submission
1. **(0:00–1:00) MCP scaffold.** Set up MCP server (`@modelcontextprotocol/sdk`): basic server, tool registration structure, prepare tool schemas for the 8 core tools (read: `get_funding`, `list_offers`, `get_position`; write: `open_hyperliquid_position`, `open_keel_position`, `settle`, `topup_hyperliquid_margin`; gated: `propose_decision`).
2. **(1:00–3:00) Implement MCP tools** (wait for `deployments.json` at 0:30):
   - **Read tools:** `get_funding(market)` via Hyperliquid API, `list_offers()` from hardcoded LP offer (fixedRate, cap, notional), `get_position(address)` from KeelSwap contract
   - **Write tools:** `open_hyperliquid_position` via HL testnet API, `open_keel_position(offerId)` calls `KeelSwap.open`, `settle(swapId, period)` calls contract
   - **Gated:** `propose_decision(swapId)` builds unsigned close/topUp tx for Ledger
3. **(3:00–5:00) Wire settlement loop + Ledger integration** (with Tomas):
   - Implement AFR/FFR comparison: when `AFR > FFR`, call `topup_hyperliquid_margin` with payout amount
   - Detect brink (`remaining < cap × notional / 1e18`) → call `propose_decision` → hand unsigned tx to Ledger
   - Test full flow: open position via MCP conversation → settlement fires → brink → Ledger signs
4. **(5:00–6:00) Demo polish + submission writeup.** Prepare demo conversation script, record MCP-driven flow, write submission highlighting "agent proposes, human disposes" thesis. Start writeup at T+5:00 regardless of MCP state; fallback to simple web chat if MCP doesn't stabilize.

---

## 4. Timeline & checkpoints

| Time | Milestone | Gate |
|---|---|---|
| 17:00 | **Standup** — lock §0 decisions, assign, confirm Ledger hw + Base mainnet RPC | go/no-go on chain |
| 17:30 | **Contracts deployed**, `deployments.json` published | everyone unblocked |
| 19:00 | MCP server scaffold live; CRE first write attempt; Ledger signs a test tx | — |
| 19:30 | **CRE checkpoint** — real write or fall back to relayer | live funding source decided |
| 20:00 | **End-to-end thread working**: MCP opens swap → settle a period → MCP reads state | the core demo exists |
| 21:30 | MCP settlement loop working (AFR/FFR comparison → topup) | hero flow locked |
| 22:30 | **Ledger moment** wired via MCP; full conversation flow tested | feature freeze approaches |
| 23:00 | **FEATURE FREEZE** — only bug-fixes on the demo path after this | — |
| 23:00–00:15 | Demo video (MCP conversation) + submission writeup + bounty applications | — |
| 00:15 | **SUBMIT** (45 min buffer for portal issues) | done |

---

## 5. Risk register & fallbacks

| Risk | Trigger | Fallback |
|---|---|---|
| CRE slow / forwarder missing on Base mainnet | not writing by 19:30 | EOA relayer posts the real API-derived index; keep 1 CRE write for the bounty |
| Base mainnet RPC flaky | deploy fails in first 30 min | swap RPC provider, else local **anvil** (or a Base fork) for the demo |
| Ledger hardware / signing library issues | confirmed at standup | software signer, keep Ledger framing; get ≥1 real Ledger sign on video if possible |
| MCP integration blockers (SDK issues, tool wiring) | behind at 21:30 | simple web chat interface calling contract functions directly; demonstrate agent-gated flow via script |
| Hyperliquid testnet API rate limits / flaky | during MCP testing | mock Hyperliquid responses in MCP tools; show API integration in code, demo with mocked data |
| Settlement reverts at brink (`InsufficientCollateral`) | by design | that's the brink — detect off-chain, surface the Ledger decision; `topUp` to continue |

---

## 6. Demo script (60–90s) — what we actually show

**THE CONVERSATIONAL FLOW (MCP-driven, agent proposes / human disposes):**

1. **Open via conversation:** User tells the MCP: *"Create a long on BTC on Hyperliquid and fix the funding rate."* MCP reads available offers, presents options, user picks one. **Agent proposes → user signs on Ledger → both legs open** (Hyperliquid perp + Keel swap, real txs on Base mainnet).

2. **Live settlement loop:** Compressed periods (120s each) settle automatically. Show MCP monitoring: *"AFR is 0.15%, FFR is 0.10% — funding is high, protocol pays you $X, topping up your Hyperliquid margin."* Real USDC movements on-chain.

3. **The Ethena comparison:** Narrate alongside: *"This is the Oct-2025 crash that bled Ethena $8B. Your rate? Still locked at 10%."* Show historical data vs flat locked line.

4. **The Ledger moment (hero):** Drive funding extreme → collateral hits brink. MCP detects it and says: *"Your collateral is low. Options: (1) Close now, (2) Add more collateral and continue. Sign on your Ledger to decide."* **Human picks up Ledger, signs the decision.** *Agent proposes, human disposes* — demonstrated live, not claimed.

5. **Closing beat:** MCP confirms: *"Position closed. You locked certainty when the market swung wild."*

**Be honest on screen:** the swap, settlements, and Ledger signatures are real (Base mainnet); the Ethena comparison uses real historical funding data in the narration.

---

## 7. Submission checklist (Shaun, from 23:00)

- [ ] Demo video (MCP conversation flow from script above — show terminal/chat with MCP, Ledger signing moment)
- [ ] Project description + the Ethena hook + **"agent proposes, human disposes" thesis**
- [ ] Architecture diagram (HL API → MCP → CRE → KeelSwap → Ledger, on Base mainnet)
- [ ] Repo link + deployed addresses (`deployments.json`) + **MCP server code**
- [ ] Bounty applications:
  - **1inch Aqua** (funding-rate swap built on Aqua, collateral as virtual balances; plain Solidity settlement core, SwapVM opcode is roadmap)
  - **Chainlink CRE** (link the real write tx, explain funding oracle)
  - **Ledger** (confirm the prize exists — highlight human-gated decision at brink)
- [ ] "Real vs scripted" note (swap/settlement real on testnet; Ethena comparison uses historical data)
- [ ] Team + roles (Shaun: MCP, You: contracts/backend, Axel: CRE, Tomas: Ledger/math)

---

## 8. Explicitly NOT building tonight

**UI (replaced by MCP)** · SwapVM opcode · AMM/LP imbalance backstop · cumulative accumulator · cross-chain collateral · re-match logic (narrated). All are roadmap — say so if asked.

**The pivot:** MCP is the demo interface. A polished rates-trading UI (Ethena replay chart, lock card, settlement feed) is deferred to post-hackathon. Tonight we prove "agent proposes, human disposes" via a conversational MCP flow.
