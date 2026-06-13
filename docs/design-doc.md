# Keel — Design Doc (ETHGlobal New York 2026)
*(working name — on-chain fixed-funding-rate swaps; alts: Parfix, Steady, Lockstep)*

> **Keel locks a fixed funding rate — rebuilt *natively on Aqua*, with collateral that never goes idle.** Perp funding swings wildly; Keel swaps your *variable* funding for a *fixed* one. The invisible cost that gutted Ethena, made fixed.

**Status:** problem validated (real, famous, recent). ⚠️ **NOT a new category — funding-rate swaps already exist (Strips, Rho, IPOR).** Our claim is *execution*, not *first*: an **Aqua-native** swap with **live (in-wallet) collateral**, a **custom SwapVM settlement opcode**, and pure matching. EVM/Solidity, **a deterministic core an agent can *operate* but not *override*** — an MCP lets an agent read Hyperliquid and drive the swap, but the one decision that moves money at the brink needs a human Ledger signature (*agent proposes, human disposes* — see §5–§6). Bounties: **1inch Aqua · Chainlink CRE · Ledger.** Deployed end-to-end on **Hyperliquid testnet (HyperEVM)** — the same venue the funding rate is read from.

---

## 1. The problem
**Funding rate = the floating fee perpetual-futures traders pay or earn, every hour.** It changes constantly — one month you earn 50% APR, the next you pay. Millions of traders, market-makers, and "delta-neutral" funds live on it, and **nobody can lock it in.**

**Ethena is the famous corpse.** Its whole strategy was *collecting* funding. At its peak it held **~$16.6B** (Sept 2025). When funding cooled, USDe's yield compressed to **5.1%** — *below* Aave's 5.4% borrow cost — the leveraged loop lost its reason to exist, and capital fled: down to **~$5.6B** today (a ~$8–11B bleed). No hack, no theft — *the safest "sleep at night" strategy in crypto was the one that lost the most,* because its income was variable and it couldn't lock it.
*(Honest framing: that's capital **redeeming** as the funding-driven yield collapsed — not trading losses; funding was the core driver alongside the broader Oct-2025 liquidation event.)*

---

## 2. Why it's painful (and timely)
TradFi solved this **40 years ago**: swap a variable rate for a fixed one — the interest-rate swap, **~$469T notional outstanding**, one of the largest markets on earth. In crypto, perps did **~$60T+ of volume in 2025**, but the funding-swap layer is **thin and unproven**: the lending-rate generation (Strips, Voltz, IPOR) **died or pivoted away**, and the one live institutional player (**Rho**) **locks collateral and isn't built on shared liquidity.** Crypto built the risk at scale; the safety net is still nascent — and **nobody has made it Aqua-native, with collateral that stays alive.**

---

## 3. How we validated it — and the hard truth
- **Problem is real + data-backed.** Ethena: ~$16.6B → ~$5.6B on yield compression ([The Block](https://www.theblock.co/post/380210/)). Funding swings violent (Mar-2020 +0.01% → −0.375% in days). ✅
- **⚠️ The instrument ALREADY EXISTS on-chain — this is NOT a new category.** A careful recheck found:
  - **Strips Finance** — *perpetual interest-rate / funding swaps*; users **lock fixed rates** off an exchange's floating funding. The exact instrument (now largely inactive — RabbitX pivoted to a perp DEX).
  - **Rho Protocol** — *funding-rate futures*: *"hedge perp funding-rate fluctuations — for the first time in crypto — higher capital efficiency, far less collateral."* That's the **full pitch, incl. the capital-efficiency wedge, already claimed.**
  - **IPOR** — fixed-rate IRS hedging (lending rates), capital-efficiency framed.
  - **HedgX** (ETHGlobal) — trades funding (speculation).
- **So the honest claim is *execution*, not *category*.** The defensible differentiator is narrow: an **Aqua-native** funding swap with **live, in-wallet collateral** (Aqua virtual balances keep both parties' capital productive while it backs the swap — Strips/IPOR lock it dead) + a **custom SwapVM settlement opcode** + pure matching/custody. Even "capital-efficient" is contested by Rho, so lean on the *specific* Aqua mechanic: **collateral that never leaves your wallet.**
- **Bottom line:** Keel competes on **Technicality + bounty-fit + the Ethena demo — not on Originality.** Don't say "first." Say *"the funding swap, rebuilt natively on Aqua, with collateral that never goes idle."*

- **Validated with numbers** (Monte Carlo, `/tmp/keel_sim.py`): on a $1M position over 30d, *unlocked* funding income swings **~40% (p5→p95)** even in a normal regime; **locking → std $0** (a single flat number). Ethena-style crash (45%→4% APR): unlocked $3,021 vs **locked $16,438 → +$13,417**. No-default checks out: max hourly owed *at the cap* = **$411**, pre-locked per party, hourly settle covers it. Fair fixed ≈ **E[funding]** (protocol takes no directional bet). *(Model is illustrative — use real Hyperliquid funding for the demo replay; collateral required = cap × notional, so pick hourly settle + a sane cap.)*

---

## 4. The solution

### The core insight (read this first — it's the part everyone gets confused on)
**Keel does not touch any Hyperliquid position.** It does not intercept or capture the funding you pay/earn on a perp. It is a **separate contract between two parties that settles against a public number** — the BTC funding rate. The contract only needs to *read what funding was* (via Chainlink CRE), not *capture* it.

> **Rain-insurance analogy.** A rain insurer doesn't control the weather or stand in your field — they pay you based on how much rain fell, measured by a public source. Keel pays based on what funding *was*, measured by CRE. **This is why we don't need to build our own perp DEX.**

**The hedge cancels algebraically.** When a hedger holds a real perp *and* takes the Keel swap, the floating funding nets out and only the fixed rate remains:

```
Pays on Hyperliquid:    − floating funding
Receives from swap:     + floating funding − fixed
                        ─────────────────────────────
Net:                    − fixed   (constant, hedged)
```

### The instrument
**A funding-rate swap: variable → fixed, in one click.** You don't change the market's funding — you lock *yours*, like switching a variable mortgage to a fixed one. Two sides:
- **Hedger** (an Ethena-like fund, any perp holder) — **pays fixed, receives floating** → their variable funding is cancelled out, leaving a flat, locked rate. Buys *certainty*. The primary customer.
- **Speculator** (cofounder's spec calls this side *Volátil*, "the volatile side") — **receives floating, pays fixed** → bets funding stays high / rises; collects a premium for absorbing the risk. Buys *upside*.
- It's **zero-sum** between the two: what one loses, the other gains, exactly. There is never a "nobody wins" period — always one payer and one receiver, mirrored.

### Why leverage matters (the customer story)
Funding is charged on **notional** but drains your **margin**. With leverage `L`, notional = margin × L, so:

```
% of margin consumed by funding = funding_rate × time × L
```

The margin cancels, leaving `L` as a multiplier. A funding spike that's a nuisance at 1× is a **liquidation at 10×**. The funding rate is the same for everyone regardless of leverage — leverage amplifies the *damage to margin*, not the rate. So the **leveraged long is the customer who needs this most**, and whom the swap protects most.
- **Keel matches** the two sides and **custodies their collateral — no house position.** When the book is imbalanced, an **LP pool steps in as a *bounded* counterparty** (capped by the hourly clamp + pre-locked collateral) and earns the spread.

As long as funding keeps moving, both sides exist — one fears it falling, one bets it rising. **The core is deterministic — no AI in the settlement math, so no hallucination risk where money moves.** An optional agent layer (our MCP, §6) can read Hyperliquid and *operate* the swap, but it cannot *override* the one decision that matters: the collateral-low call is gated behind a human Ledger signature. **Agent proposes, human disposes.**

---

## 5. The mechanism (the core)
- **The swap.** Each hour, the two legs exchange the **fixed-vs-realized-floating** difference from pre-locked collateral. The hedger's perp funding (floating) is offset by the floating leg they trade away → **net funding = the fixed rate. Locked.**
- **The AMM (and the imbalance answer).** LPs quote the fixed rate off a utilization curve. **Matched fixed/floating flow nets peer-to-peer** (capital-efficient via Aqua virtual balances — the Aqua0 thesis: matched flow needs ~no capital). The LP pool absorbs the **net imbalance** and is paid the fee + spread + carry for it.
- **Why it survives a black swan — three locks:**
  1. **Matcher + custodian, not a house position** — matched flow nets to zero; the protocol holds no directional bet of its own.
  2. **Hourly settlement** — debt never accumulates; exposure resets every hour.
  3. **Funding is capped per hour (venue clamp) + collateral pre-locked to cover that max** → *the most anyone can owe in an hour is already paid up front → no default.* If a side runs out of collateral, **close only their side; the counterparty is still paid in full.**
- **Honest residual risks (say them):** the **LP pool *does* take bounded imbalance risk** (managed/capped, not zero) — Voltz-style; **oracle staleness under congestion**; **correlated collateral.** Owning these makes you more credible.
- **Worked example.** Lock **10% APR**. Real funding → **0%**: you still receive 10% (counterparty covers the gap from pre-locked collateral). Real funding → **50%**: you still get 10%, counterparty keeps the surplus. Either way, **your rate didn't move.**

### The Ledger moment (the second core feature)
If a side's remaining collateral drops below the threshold for one more worst-case period (`remaining < cap × notional`), Keel does **NOT** close blindly. It triggers a **human decision point, signed with a Ledger**. Three options are presented:
1. **Close** the swap and settle now,
2. **Re-match** — find a new counterparty,
3. **Continue** — post more collateral / ride it out.

This is the deliberate anti-agent angle: **the decision that matters is made by a human, not an algorithm.** Human-in-the-loop, explicitly *not* an agent — no hallucination risk on the one call that moves real money at the brink. (In code, the threshold check is the `maxPeriodAmount(cap, notional)` floor already enforced by `KeelSwap`; the Ledger signature gates which of the three branches executes.)

---

## 6. Architecture (cofounder's design — Aqua at the center, on Hyperliquid)
**The 3-layer stack:** **Chainlink CRE** (the funding-rate oracle) → **1inch Aqua / SwapVM** (custodies collateral as live virtual balances and nets fixed-vs-floating each period) → **Ledger** (a human signs the decision at the critical moment — explicitly *not* an agent).

**The full flow:** Chainlink CRE reads BTC's real funding rate from **Hyperliquid** each period → writes it on-chain as a **funding index** → the swap contract on **1inch Aqua** reads that index, computes fixed-vs-floating, and transfers the difference between the two parties → settlement and payout in **USDC**. **Everything deploys on Hyperliquid testnet (HyperEVM)** — the same venue the funding rate comes from, so the oracle source and the settlement chain are one and the same.

```
 HEDGER ─lock fixed─┐                          ┌─ SPECULATOR / Volátil (take floating)
                    ▼                          ▼
        KEEL — funding-rate swap on 1inch Aqua / SwapVM  (HyperEVM testnet)
        • matched flow nets via VIRTUAL BALANCES (collateral stays in wallet, alive)
        • custom SwapVM opcode = periodic settlement (a derivative, not a trade)
        • Aqua matches + custodies (no house position; LP pool backstops imbalance, bounded)
                    ▲ funding index            │ collateral-low → human decision
        ┌───────────┴───────────┐             ▼
   CHAINLINK CRE                          LEDGER (human signs: close / re-match / continue)
   Hyperliquid funding via API → DON → on-chain        settle / payout in USDC
```

**1inch Aqua — the core; the whole instrument lives here.** Three things only Aqua makes possible:
- **Collateral that stays alive.** Strips/IPOR lock collateral dead for weeks; with Aqua **virtual balances**, both parties' collateral stays **productive in their wallets** while still backing the swap. For a multi-week hedge, that's usable vs. unusable. *(This is our one real edge vs. Rho/Strips — protect it.)*
- **A custom SwapVM opcode for periodic settlement.** Not a spot swap — a dedicated settlement instruction that reads the funding index and nets fixed-vs-floating each period, on-chain. A new use of SwapVM: **a derivative, not a trade.**
- **The matching/custody layer.** Aqua holds both sides and enforces the swap without the *protocol* ever taking a house position — it just matches and settles. *(Honest caveat: matched flow nets to zero; when the book is one-sided, an LP pool absorbs the residual as a **bounded** counterparty — not zero-risk, but capped.)*

*Pitch to 1inch:* "We didn't bolt Aqua onto a swap — we built a **periodic-settlement derivative inside SwapVM**, with collateral that never goes idle. Aqua doing something it was never shown doing before."

**Chainlink CRE — the oracle that doesn't exist.** There's no on-chain funding-rate oracle. CRE fetches Hyperliquid funding via API, reaches DON consensus, writes it on-chain. Without CRE there's nothing to swap.
**Ledger — the human hand at the brink.** The whole design is deterministic *except* one moment: when a side's collateral runs low, the close/re-match/continue decision is too consequential to automate. A human signs it on a Ledger. This is the explicit anti-agent stance — "the decision that matters is made by a human, not an algorithm."

**One line each:** **Aqua = the engine** (the table, collateral stays alive) · **CRE = the thermometer** (measures funding, puts it on-chain) · **Ledger = the hand on the lever** (signs the one decision that matters). *Pull any one and the product breaks — but Aqua is the one we push furthest.* Settlement currency is **USDC on HyperEVM**.

### The agent layer (MCP) — agent proposes, human disposes
A **Keel MCP server** lets an agent (Claude, or any MCP client) operate the protocol end-to-end: read live **Hyperliquid funding** + positions, fetch quotes, and take routine actions (open / monitor / settle a swap). The agent does the analysis and *prepares* the consequential decision — but at the brink (a side's collateral `< cap × notional`), the close / re-match / continue action is **handed to a human to sign on a Ledger**. The MCP never holds the key for that step.

This is the reconciliation of "agent-operated" with "anti-agent": the protocol is fully driveable by an agent, yet the one transaction that moves real money at the edge is **physically gated behind a hardware signature**. It is both a slick demo surface (drive Keel live from Claude) *and* the strongest possible statement of the human-in-the-loop thesis — *agent proposes, human disposes.*

- **Read tools:** `get_funding(market)`, `get_positions(addr)`, `get_swap(id)`, `quote_fixed(notional, tenor)`.
- **Write tools (routine):** `open_swap(...)`, `settle(swapId, period)`, `preview_settle(swapId, realized)`.
- **Gated tool (brink):** `propose_decision(swapId)` returns the *unsigned* close / re-match / continue tx for a **Ledger** to sign — the agent surfaces the choice; the human commits it.

*(Honest framing: keep the deterministic claim precise — there is no AI in the settlement math; the agent is an operating convenience on top, and the brink stays human. Don't let the MCP demo dilute "no hallucination where money moves.")*

### Feasibility against the bounty stack (verified this session)
- **1inch Aqua / SwapVM** — verified from the `1inch/aqua` + `swap-vm` repos (**the 1inch MCP is *not* live in this session — checked the source instead**). Virtual balances ✓ (collateral stays in-wallet). **CATCH:** SwapVM `swap()` is **atomic, no native hold/expiry** — so **periodic settlement cuts against SwapVM's design and is the hardest piece.** It works as a **keeper/CRE-triggered settlement swap each period** that calls the custom opcode against the latched funding index — feasible, not native. **Long pole. Keep a plain-Solidity settlement fallback; don't claim the opcode runs until validated.**
- **Chainlink CRE** — verified (chainlink-cre-skill / docs): HTTP/Confidential-HTTP → DON consensus → on-chain write (KeystoneForwarder). Reading Hyperliquid funding via API and posting an index is squarely in scope. ✓
- **Hyperliquid testnet (HyperEVM)** — the deploy target for *everything* (oracle source = settlement chain). ⚠️ **OPEN FEASIBILITY (validate in first 3 hours):** (a) is the **CRE KeystoneForwarder** available / deployable on HyperEVM testnet, or do we relay the index from an EOA fallback? (b) does HyperEVM support **transient storage (EIP-1153)** that SwapVM's reentrancy lock needs — if not, the plain-Solidity settlement core (already built, M1) is the fallback and the `_fundingSettle` opcode is dropped to roadmap. (c) USDC on HyperEVM testnet — use canonical test USDC or deploy `MockUSDC` (already in repo).
- **Ledger** — hardware-wallet signing of the collateral-low decision. Feasible as a standard EIP-712 / transaction signing flow from a Ledger device in the web app; no protocol-level dependency, so it cannot block the settlement core. The narrative weight (human-in-the-loop, not an agent) is the point.

### The opcode + MVP scope
**The whole on-chain core = one custom opcode + one oracle-write + two swaps:**
- **`_fundingSettle(Context, bytes)`** — the one custom SwapVM instruction: reads the latched funding index + swap terms (fixed rate, notional, parties), computes the net cashflow `(realized − fixed) × notional` (capped at the hourly clamp), and `pull()/push()`es it from payer → receiver. Marks the period settled (no double-settle).
- **`setFundingIndex(period, value)`** — storage latch written by the **CRE KeystoneForwarder** (`onlyForwarder`).
- **Open / close** = ordinary swaps (pull collateral → mint position tokens / return collateral).
- **MVP scope:** one *matched* swap (one hedger + one speculator) + `_fundingSettle` + the CRE index + a keeper firing hourly `settle()`. **That alone demos the thesis.** The **AMM/LP backstop for imbalance is phase 2** — mock/simplify it for the demo. Keep the **plain-Solidity settlement fallback** ready; don't claim the opcode runs until validated. *(SwapVM is atomic with no native scheduling → the hourly settle is keeper/CRE-triggered each period.)*

### Settlement math (formal spec — reconciled with the shipped `KeelSwap`)
Variables: `N` = notional (USDC, 1e6), `F` = fixed rate, `R` = realized floating rate for the period (from CRE), `cap` = max |R − F| per period (venue funding clamp), `Δt` = period length as a fraction of a year.

- **Per-period net cashflow:** `payment = N × clamp(R − F, ±cap)` (the credit to the **hedger**). Equivalently, the hedger's *outflow* is `N × (F − R)`.
  - **Direction (canonical, from the tested contract):** `R > F` → **hedger is credited, speculator pays**; `R < F` → **hedger pays, speculator is credited**. ⚠️ The cofounder's draft wrote *"F > R → Hedger receives,"* which contradicts the "hedger receives floating" definition; the shipped, unit-tested `KeelSwap` uses `net = realized − fixed` (hedger = floating receiver), and that is the source of truth.
- **No-default bound:** `maxPeriodAmount = cap × N` — the most that can move in one period. Each side pre-locks at least this (`collateral_min ≥ cap × N`; size to `cap × N × periods_buffered` for a multi-period buffer).
- **Close trigger (→ Ledger):** close/decide when `remaining_collateral < cap × N` (can't cover one more worst-case period).
- **Final PnL per side:** `Σ over settled periods of N × clamp(R_i − F, ±cap)` (sign per side).
- **Fair fixed rate (advanced):** `F ≈ E[R]` over the tenor, so the swap is zero-expected-value at inception (protocol takes no directional bet).

**Two open decisions Tom flags as blocking — lock before M3:**
1. **Simple vs compound accumulator.** Tom's spec wants an **IPOR-style cumulative funding index** (`cumIndex`), so realized floating between any two timestamps = `cumIndex_B − cumIndex_A` (enables lazy / range settlement). The current `KeelSwap` settles **discretely per period** (every period must be settled; keeper fires each period). Decide: keep discrete per-period (simpler, already built) or move to a cumulative accumulator (one call can catch up many periods). *Recommendation: ship discrete for the demo; note cumulative as the post-hackathon path.*
2. **Annualized-to-period convention for `Δt`.** The contract works in **per-period fractional rates** (Δt already folded into the index/fixed rate written on-chain; rates are signed 1e18). The UI quotes annualized; CRE/edge code converts. For the compressed demo (~2 min/period), keep `Δt` real-time-proportional and **document the exact convention** so the numbers reconcile on screen.

---

## 7. User flows
- **Hedger:** pick venue + tenor → see live **floating** vs the quoted **fixed** → **Lock fixed** → watch real funding bounce while your rate stays flat → hourly settlement → close at maturity.
- **Speculator:** **Go floating / bet funding up** → receive floating, pay fixed.
- **LP:** deposit collateral → earn fee + spread + the carry on imbalance; risk is bounded by the hourly cap + pre-locked collateral.

---

## 8. Bounties (verified, all load-bearing)
| Bounty | $ | Why it's *necessary* |
|---|---|---|
| **1inch — Build an Aqua App** | $5,000 | The funding-rate-swap **AMM** + `_fundingSettle` SwapVM opcode (their AMM/Options examples; SwapVM scored higher). |
| **Chainlink — CRE** | $6,000 (3×$2k) | The on-chain **funding-rate oracle** — without it the swap can't settle. Real external-data → DON → on-chain state change. Best, most honest Chainlink fit of the event. |
| **Ledger** | TBD ⚠️ *(confirm prize at the event — amount not yet verified)* | The human-in-the-loop signing at the collateral-low decision (close / re-match / continue). The anti-agent angle: the one decision that moves real money at the brink is signed by a human on a Ledger, not executed by an algorithm. |
| *LI.FI (optional 4th)* | $4,000 | Cross-chain collateral onboarding via a Composer Flow. |
| *Hyperliquid (deploy target)* | — | Everything runs on HyperEVM testnet (oracle source = settlement chain); check for a Hyperliquid/HyperEVM ecosystem prize at the event. |
| *MCP / agent surface (optional)* | TBD | The Keel MCP — agent reads Hyperliquid + operates the swap, brink decision gated behind a Ledger signature. Check for an MCP/agent/x402 prize at the event. |

The required pieces (Aqua, CRE) are undeniably load-bearing — there's no "bolted on?" risk, and **Chainlink finally fits for real.** Ledger is the one we should pressure-test for bounty fit on site (it's a strong *narrative* pillar; confirm there's a prize to claim).

---

## 9. The demo (the Ethena replay + a rates trading UI)
**Hero beat — "Relive October 2025, locked vs. unlocked."** Two funds side by side, fed the **real funding-rate crash** on a time-slider: the **unlocked fund's income craters** with funding; the **locked fund stays dead flat.** Hold the diverging lines — *"Same crash. One bled $8B. One didn't feel it."*

**UI form — a focused *lock* UI, NOT a trading terminal.** No orderbook / depth / candlesticks (they misrepresent the matching/AMM model *and* bury the WOW, and you'd have to fake liquidity). Rates-desk *aesthetic*, one-click-lock *interaction*. Four surfaces: a **rates board** (markets → live floating + fixed quotes by tenor, the cheap "this is a market" view), a **lock card** (floating ticker vs fixed quote + Lock-fixed / Take-floating), a **position + hourly-settlement feed**, and the **hero comparison chart**. *(A paste-ready Claude Design prompt for this exists.)*

**The product UI around it:**
1. **Funding-market panel** — live, jumpy **floating ticker** next to the **AMM-quoted fixed rate**; **Lock fixed** / **Go floating** buttons (the two-sided market, visible).
2. **One-click lock** — *"Locked 10% APR, 30 days, $50k notional"* → a live strip showing real funding moving while your rate is flat.
3. **Hourly settlement, live** — each period the swap settles in **real USDC on Hyperliquid testnet (HyperEVM)**; show the cashflow + pre-locked collateral → **"no default possible," shown not asserted.** (Demo compresses ~2 min/period so a multi-week hedge fits the slot — documented, not faked.)
4. **The Ledger moment** — drive a side's collateral to the brink, then show Keel *pause* and surface the close / re-match / continue choice. A human picks up the **Ledger and signs** the decision live. "The decision that matters is made by a human, not an algorithm" — demonstrated, not asserted.

**Real vs scripted:** the AMM quote, the lock, and the hourly USDC settlements are real (testnet); the crash **replay** uses real historical funding data on a slider so a 2-month event fits 60 seconds. Say so.

---

## 10. WOW moments
1. **The Ethena replay** — the trade that would've stopped an $8B bleed, locked-flat vs. floating-crater.
2. **One-click "lock your funding rate"** — a brand-new instrument, made trivial.
3. **Visible no-default settlement** — the "we don't die" claim *demonstrated* hourly, not just stated.
4. **Agent operates, human signs at the brink** — drive Keel live from an agent (the MCP reads Hyperliquid and opens/settles the swap), then hit the edge: the agent *prepares* the close/re-match/continue call and **hands it to a person to sign on a Ledger.** In a sea of "fully autonomous agent" demos, the deliberate *agent-proposes-human-disposes* beat lands hardest: the decision that moves money is human.

---

## 11. Pitch script (≤60s)
> "A fund was worth $15 billion. Two months later it had shed $8 billion — no hack, no theft, just an invisible cost that moved and nobody could stop it. That's **Ethena**: it lived off the funding rate; when funding collapsed, the safest strategy in crypto became the one that lost the most. Millions pay or earn that same cost — and locking it on-chain is still painful: the few who tried **lock your collateral dead for weeks**, and most have already pivoted away. TradFi fixed this 40 years ago with interest-rate swaps — a **$469-trillion** market.
>
> **Keel rebuilds the funding-rate swap natively on Aqua — you lock your rate, variable to fixed, in one click, and your collateral never goes idle.** We don't bet: we match the one who wants certainty with the one who wants the upside, custody their collateral, and earn a fee on the flow — like an exchange. It settles every hour against a Chainlink funding feed, funding is capped, and collateral is pre-locked to cover the max — so the most anyone can owe is already paid.
>
> Crypto built $60 trillion a year of this risk; the safety net is still nascent. Watch the trade that would have saved Ethena."

**Close:** *"Lock the rate that broke the safest fund in crypto."*

---

## 12. Risks & open items
- **Imbalance:** the LP/AMM pool takes *bounded* risk (capped by the hourly clamp + pre-locked collateral) — not "zero position." Be upfront; it's Voltz-style and fine, just don't claim zero-risk.
- **Oracle staleness under congestion** + **correlated collateral** — the two residual technical risks; acknowledge them.
- **NEVER claim "first."** **Rho Protocol is live, funded ($6.34M, CoinFund-led), and institutional** (Rho X + BitGo Go Network, "first institutional on-chain rates market") — it trades perp funding-rate futures + a funding index *today*. Strips pivoted to RabbitX (perp DEX); IPOR pivoted to Fusion (yield vaults); Voltz sunset (→ Reya). **We compete on Aqua-native execution + live collateral + the Ethena demo + the Aqua/CRE bounty fit + the human-signed (Ledger) anti-agent angle — not on novelty.** If a judge names Rho, agree and pivot to "we made it Aqua-native, non-custodial, with collateral that never goes idle."
- **PMF caution:** the lending-rate generation died from weak PMF; Rho validates perp-funding demand *and* is the incumbent. This is an execution + integration play, not a greenfield market.
- **Numbers:** $469T = *notional outstanding* (say "notional"); define/source the on-chain comparison figure precisely (don't get caught by Pendle being billions); the **funding cap + hourly interval are venue-specific** (state the venue, e.g. Hyperliquid hourly).
- **Two blocking math decisions (lock before M3):** (1) **simple vs compound accumulator** — discrete per-period (built) vs IPOR-style cumulative `cumIndex`; (2) **annualized-to-period `Δt` convention** for the compressed demo. Everything downstream builds on these — see §6 *Settlement math*.
- **HyperEVM feasibility (validate in first 3 hours):** CRE KeystoneForwarder availability on HyperEVM testnet (else EOA relayer fallback); EIP-1153 transient-storage support for SwapVM's lock (else plain-Solidity core is the path and the opcode is roadmap); test USDC (canonical vs `MockUSDC`).
- **Ledger as bounty:** strong *narrative* pillar; **confirm there is an actual Ledger prize at the event** before counting on it (amount unverified — see §8).
- **First-3-hours validation gate (fail fast):** (1) can CRE fetch Hyperliquid BTC funding and write the index on-chain to a consumer on HyperEVM? → else EOA relayer fallback. (2) can a custom SwapVM opcode be written + deployed quickly? → else drop to plain-Solidity settlement immediately. (3) can the contract read the index and transfer between two parties in one period? → this is the core; prove it before any UI. *(Full gate also lives in `docs/build-plan.md`.)*
- **Build long poles (start now):** the `_fundingSettle` opcode + the fixed-rate AMM curve; the CRE funding-oracle workflow; the hourly settlement + collateral/cap loop (✅ M1 settlement core done — 25 tests green).
