# Keel — Design Doc (ETHGlobal New York 2026)
*(working name — on-chain fixed-funding-rate swaps; alts: Parfix, Steady, Lockstep)*

> **Keel locks a fixed funding rate — rebuilt *natively on Aqua*, with collateral that never goes idle.** Perp funding swings wildly; Keel swaps your *variable* funding for a *fixed* one. The invisible cost that gutted Ethena, made fixed.

**Status:** problem validated (real, famous, recent). ⚠️ **NOT a new category — funding-rate swaps already exist (Strips, Rho, IPOR).** Our claim is *execution*, not *first*: an **Aqua-native** swap with **live (in-wallet) collateral**, a **custom SwapVM settlement opcode**, and pure matching. EVM/Solidity, **a deterministic core an agent can *operate* but not *override*** — an MCP lets an agent drive the swap, but the brink decision is a human checkpoint (*agent proposes, user confirms* — see §5–§6). Bounties: **1inch Aqua · Chainlink CRE · LI.FI.** Funding is read from **Hyperliquid**; the swap is deployed on **Ethereum Sepolia**.

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
**The Keel contract does not touch any Hyperliquid position.** It does not intercept or capture the funding you pay/earn on a perp. It is a **separate contract between two parties that settles against a public number** — the BTC funding rate. The contract only needs to *read what funding was* (via Chainlink CRE), not *capture* it. *(The optional MCP agent can **open and top up** your Hyperliquid leg on your behalf via API — see §6 — but the contract itself never does.)*

> **Rain-insurance analogy.** A rain insurer doesn't control the weather or stand in your field — they pay you based on how much rain fell, measured by a public source. Keel pays based on what funding *was*, measured by CRE. **This is why we don't need to build our own perp DEX.**

**The hedge cancels algebraically.** When a hedger holds a real perp *and* takes the Keel swap, the floating funding nets out and only the fixed rate remains:

```
Pays on Hyperliquid:    − floating funding
Receives from swap:     + floating funding − fixed
                        ─────────────────────────────
Net:                    − fixed   (constant, hedged)
```

### The instrument & who's who
**A funding-rate swap: variable → fixed, in one click.** You don't change the market's funding — you lock *yours*, like switching a variable mortgage to a fixed one. Three roles, but only **two are live in the MVP**:

- **Hedger = the perp trader = the customer (the *taker*).** Holds a leveraged long on Hyperliquid, pays funding, hates the swings. On Keel they **pay fixed, receive floating** → their variable funding is cancelled, leaving a flat locked rate. They **take** a rate we offer, one click. The primary customer and the protagonist (the Ethena character).
- **Keel LP = us = the rate-offerer (the *maker*).** We post **consistent fixed-rate offers** and stand as the counterparty, so a hedger can lock **instantly** without waiting for anyone to show up. We take the opposite leg — **receive fixed, pay floating** — so we earn the premium when funding stays below the locked rate and pay out (bounded per period by the cap) when it spikes. The *certainty-seller*.
- **Speculator (*Volátil*) — deferred to phase 2, NOT built.** In the mature market, people who want to bet on funding take the LP's side and the LP only fills the gaps. **For now, we ARE the counterparty.**

> **Leg direction (canonical, from the tested `KeelSwap`):** the hedger's net per period = `(realized − fixed) × notional` — they gain when funding is **high**, which offsets the high funding they pay on Hyperliquid. The LP is the exact mirror, `(fixed − realized) × notional` — gains when funding is **low**. *(Earlier drafts mislabeled both sides as "receives floating" — that was a bug; this is the correct, tested convention.)*

**Cold-start is the real problem this solves.** A swap needs a counterparty, and at any moment there may be none. By making our **LP the always-on rate-offerer**, a hedger gets certainty on day one — the missing piece that turns the idea into a working product.

### Why leverage matters (the customer story)
Funding is charged on **notional** but drains your **margin**. With leverage `L`, notional = margin × L, so:

```
% of margin consumed by funding = funding_rate × time × L
```

The margin cancels, leaving `L` as a multiplier. A funding spike that's a nuisance at 1× is a **liquidation at 10×**. The funding rate is the same for everyone regardless of leverage — leverage amplifies the *damage to margin*, not the rate. So the **leveraged long is the customer who needs this most**, and whom the swap protects most.
- **The protocol itself stays neutral** — the Keel *contract* only custodies collateral and settles; it holds no position. The *liquidity* comes from our **LP** (bounded by the per-period cap + pre-locked collateral), exactly as an exchange is neutral while market-makers provide the quotes. In the demo we run that LP; in production it's many LPs + speculators.

**The core is deterministic — no AI in the settlement math, so no hallucination risk where money moves.** An optional agent layer (our MCP, §6) can *operate* the swap, but it cannot *override* the one decision that matters: the collateral-low call is a **human checkpoint** — the agent proposes, the user confirms. **Agent proposes, user confirms.**

---

## 5. The mechanism (the core)
- **The swap.** Each hour, the two legs exchange the **fixed-vs-realized-floating** difference from pre-locked collateral. The hedger's perp funding (floating) is offset by the floating leg they trade away → **net funding = the fixed rate. Locked.**
- **Pricing & liquidity (the RFQ model).** Our **LP quotes a consistent fixed rate** (≈ expected funding + a small maker spread). A hedger **takes** that offer one-click — no waiting for a matching speculator — and confirms it in-app. Because we're the standing counterparty, liquidity is **instant**. *(Phase 2: when real speculators exist, matched hedger/speculator flow nets peer-to-peer via Aqua virtual balances — the Aqua0 thesis, matched flow needs ~no capital — and the LP only covers the residual.)*
- **Why it survives a black swan — three locks:**
  1. **The protocol is neutral; the LP's risk is bounded.** The Keel *contract* holds no position — it only custodies and settles. Our **LP** is the counterparty and *does* take directional risk, but it is **bounded**: per period it can never owe more than `cap × notional`, and that max is pre-locked up front.
  2. **Hourly settlement** — debt never accumulates; exposure resets every hour.
  3. **Funding is capped per hour (venue clamp) + collateral pre-locked to cover that max** → *the most anyone can owe in an hour is already paid up front → no default.* If a side runs out of collateral, **close only their side; the counterparty is still paid in full.**
- **Honest residual risks (say them):** as the **primary LP we take bounded directional risk** (capped per period, not zero — we earn when funding stays calm, pay when it spikes) — Voltz-style; **oracle staleness under congestion**; **correlated collateral.** Owning these makes you more credible.
- **Worked example.** Lock **10% APR**. Real funding → **0%**: you still receive 10% (counterparty covers the gap from pre-locked collateral). Real funding → **50%**: you still get 10%, counterparty keeps the surplus. Either way, **your rate didn't move.**

### The brink decision (the second core feature)
If a side's remaining collateral drops below the threshold for one more worst-case period (`remaining < cap × notional`), Keel does **NOT** close blindly. It surfaces a **human decision point** — the MCP agent prepares it, the user confirms. Three options are presented:
1. **Close** the swap and settle now,
2. **Re-match** — find a new counterparty,
3. **Continue** — post more collateral / ride it out.

This is the human-in-the-loop checkpoint: **the agent proposes, but the decision that moves money at the brink is confirmed by a person.** (In code, the threshold check is the `maxPeriodAmount(cap, notional)` floor already enforced by `KeelSwap`; the user's confirmation gates which of the three branches executes.)

---

## 6. Architecture (Aqua at the center)
**The 3-layer stack:** **Chainlink CRE** (the funding-rate oracle) → **1inch Aqua / SwapVM** (custodies collateral as live virtual balances and nets fixed-vs-floating each period) → **LI.FI** (cross-chain collateral onboarding — detailed in the LI.FI section, owned by the integration lead).

**The full flow:** Chainlink CRE reads BTC's real funding rate from **Hyperliquid** each period → writes it on-chain as a **funding index** → the swap contract on **1inch Aqua** reads that index, computes fixed-vs-floating, and transfers the difference between the two parties → settlement and payout in **USDC**. **The swap is deployed on Ethereum Sepolia** (CRE and LI.FI support it, and we deploy our own Aqua + router there); **Hyperliquid is the funding-rate data source.**

```
 HEDGER (customer) ─takes our rate─┐          ┌─ KEEL LP (us) — offers the fixed rate
                    ▼                          ▼   (speculators take this side in phase 2)
        KEEL — funding-rate swap on 1inch Aqua / SwapVM  (Ethereum Sepolia)
        • matched flow nets via VIRTUAL BALANCES (collateral stays in wallet, alive)
        • custom SwapVM opcode = periodic settlement (a derivative, not a trade) — BUILT + TESTED
        • Aqua matches + custodies (no house position; LP is the bounded counterparty)
                    ▲ funding index            │ collateral-low → human checkpoint
        ┌───────────┴───────────┐             ▼
   CHAINLINK CRE                          USER CONFIRMS (close / re-match / continue, via MCP)
   Hyperliquid funding via API → DON → on-chain        settle / payout in USDC
```

**1inch Aqua — the core; the whole instrument lives here.** Three things only Aqua makes possible:
- **Collateral that stays alive.** Strips/IPOR lock collateral dead for weeks; with Aqua **virtual balances**, both parties' collateral stays **productive in their wallets** while still backing the swap. For a multi-week hedge, that's usable vs. unusable. *(This is our one real edge vs. Rho/Strips — protect it.)*
- **A custom SwapVM opcode for periodic settlement.** Not a spot swap — a dedicated settlement instruction that reads the funding index and nets fixed-vs-floating each period, on-chain. A new use of SwapVM: **a derivative, not a trade.**
- **The matching/custody layer.** Aqua holds both sides and enforces the swap without the *protocol* ever taking a house position — it just matches and settles. *(Honest caveat: matched flow nets to zero; when the book is one-sided, an LP pool absorbs the residual as a **bounded** counterparty — not zero-risk, but capped.)*

*Pitch to 1inch:* "We didn't bolt Aqua onto a swap — we built a **periodic-settlement derivative inside SwapVM**, with collateral that never goes idle. Aqua doing something it was never shown doing before."

**Chainlink CRE — the oracle that doesn't exist.** There's no on-chain funding-rate oracle. CRE fetches Hyperliquid funding via API, reaches DON consensus, writes it on-chain. Without CRE there's nothing to swap.
**LI.FI — cross-chain collateral onboarding.** A hedger funds and opens the position with USDC from any chain in one Composer flow, so capital location is never a barrier to hedging. *(Detailed in the LI.FI section, owned by the integration lead.)*

**One line each:** **Aqua = the engine** (the table, collateral stays alive) · **CRE = the thermometer** (measures funding, puts it on-chain) · **LI.FI = the on-ramp** (brings collateral cross-chain). *Pull any one and the product breaks — but Aqua is the one we push furthest.* Settlement currency is **USDC on Ethereum Sepolia**.

### The agent layer (MCP) — the one-click front door (agent proposes, human disposes)
The **Keel MCP** is how a user enters in one conversation. The agent orchestrates **both legs** of the hedge on the user's behalf; the user confirms with a single in-app signature.

**The conversation (illustrative):**
> **User:** "Create a long on BTC on Hyperliquid and fix the funding rate."
> **MCP:** "You have 3 fixed-rate positions to choose: 1) **5% fixed rate, $20k max coverage**; 2) … ; 3) …"
> **User:** "I want the one at 5%."
> **MCP:** "Okay — confirm to open."

The "3 fixed-rate positions" are **our LP's standing offers** — each is a `fixed rate` + a `max coverage` (where coverage = `cap × notional`, the most the insurance pays out). The user picks one and **confirms to open** (a single in-app signature).

**Two legs, one click.** On that signature the MCP opens:
1. **The Hyperliquid perp** — the user's actual leveraged long, via the **Hyperliquid testnet API**. *(The MCP acts on the user's behalf; the Keel **contract** never touches Hyperliquid — see §4 core insight.)*
2. **The Keel position** — the fixed-rate swap against our LP (`KeelSwap.open`). The user's collateral is now locked in as insurance.

**The settlement loop (each period, while the perp is open).** Let `AFR` = Actual Funding Rate (realized, from CRE) and `FFR` = Fixed Funding Rate (the locked rate):
- **`AFR > FFR`** → funding is high and draining the perp's margin → **the protocol pays the user, and the MCP routes that payout into the Hyperliquid position's margin** (tops it up — the hedge in action).
- **`AFR < FFR`** → funding is below the locked rate → **the premium flows from the user's Keel collateral into the LP/protocol pool** (the cost of certainty).

This is the §4 algebraic cancellation made real: the Keel payout refills exactly the margin that high funding drains, so the user's **net funding cost stays pinned at the fixed rate.** (`AFR`/`FFR` map 1:1 to `realized`/`fixed` in `KeelSwap`; `AFR > FFR` ⇒ hedger credited — consistent with the tested contract.)

```
[Chat on MCP] ──► [MCP] ──┬──► Create Hyperliquid perp        (HL testnet API)
  pick offer, confirm     └──► Create Keel position           (KeelSwap.open) → capital locked
                                        │
                     ┌──────────────────▼──── loop while perp open ─────────────────┐
                     │  Is the HL position open? ── yes ──► AFR vs FFR?              │
                     │      AFR > FFR → protocol pays user → top up HL margin        │
                     │      AFR < FFR → premium from user  → protocol/LP pool        │
                     └───────────────────────────────────────────────────────────────┘
                                (at the brink: propose_decision → user confirms in-app)
```

**Tool surface:**
- **Read:** `get_funding(market)` (AFR via CRE), `list_offers()` (the LP's fixed-rate offers), `get_position(addr)`, `preview_settle(swapId, realized)`.
- **Open (user-signed):** `open_hyperliquid_position(market, side, size)` (HL testnet API) + `open_keel_position(offerId)` (`KeelSwap.open`).
- **Settle (routine, keeper/agent):** `settle(swapId, period)` → on `AFR > FFR`, `topup_hyperliquid_margin(...)`.
- **Gated (brink, user-confirmed):** `propose_decision(swapId)` → the *unsigned* close / top-up / re-match tx for the user to confirm.

**Neutrality stays honest:** the Keel *contract* still only reads the public funding number and settles — it never touches Hyperliquid. The *MCP* is the convenience layer that drives the user's own HL leg via API and mirrors payouts to it. There's no AI in the settlement math (no hallucination where money moves); the agent builds both txs, the **user confirms.** *Agent proposes, user confirms.*

### Feasibility against the bounty stack (verified this session)
- **1inch Aqua / SwapVM** — ✅ **BUILT + TESTED** (`packages/swapvm`). A custom `_fundingSettle` SwapVM instruction (`amountOut = clamp(R−F,±cap)×N`) registered in our own router (`KeelSwapVMRouter`); virtual balances keep collateral in-wallet. Verified end-to-end: a settlement executes through the opcode and **moves real USDC via Aqua** (5 tests incl. e2e). Each period is one atomic, keeper/CRE-triggered swap; recurrence is external.
- **Chainlink CRE** — verified (chainlink-cre-skill / docs): HTTP/Confidential-HTTP → DON consensus → on-chain write (KeystoneForwarder). Reading Hyperliquid funding via API and posting an index is squarely in scope. ✓
- **Ethereum Sepolia** — the deploy target for the swap (Aqua, CRE, and LI.FI all support it; EIP-1153 transient storage is available, so the SwapVM opcode runs). Open items: confirm the **CRE KeystoneForwarder** address on Ethereum Sepolia (else EOA relayer fallback); test USDC (canonical vs `MockUSDC`, already in repo). **Hyperliquid** is the funding-rate data source (read via API by CRE), not a deploy target.
- **LI.FI** — cross-chain collateral onboarding via a Composer flow. *(Owned by the integration lead — see the LI.FI section.)*

### The opcode + MVP scope
**The whole on-chain core = one custom opcode + one oracle-write + two swaps:**
- **`_fundingSettle(Context, bytes)`** — the one custom SwapVM instruction: reads the latched funding index + swap terms (fixed rate, notional, parties), computes the net cashflow `(realized − fixed) × notional` (capped at the hourly clamp), and `pull()/push()`es it from payer → receiver. Marks the period settled (no double-settle).
- **`setFundingIndex(period, value)`** — storage latch written by the **CRE KeystoneForwarder** (`onlyForwarder`).
- **Open / close** = ordinary swaps (pull collateral → mint position tokens / return collateral).
- **MVP scope:** one swap between a **hedger (customer/taker)** and **our LP (maker/counterparty)** + the CRE index + a keeper firing `settle()` each period. The hedger takes our offered fixed rate via the MCP and confirms in-app. **That alone demos the thesis.** The **`_fundingSettle` SwapVM opcode is built + tested** (`packages/swapvm`); `KeelSwap` (plain Solidity) is the equivalent fallback. **Speculators are phase 2.** *(SwapVM has no native scheduling → the settle is keeper/CRE-triggered each period.)*

### Settlement math (formal spec — reconciled with the shipped `KeelSwap`, source of truth: 25 tests green)
**The shipped, unit-tested `KeelSwap` is canonical.** Where any earlier draft disagrees with the contract, the contract wins. The three decisions below are **LOCKED** (no longer open).

**Variables (and their on-chain scale):**
- `N` = notional, **USDC `1e6`**.
- `F` = fixed rate, **per-period, signed `1e18`**.
- `R` = realized floating rate for the period (from CRE), **per-period, signed `1e18`**.
- `cap` = max `|R − F|` per period (the Hyperliquid hourly funding clamp) = **`0.04` per period → `4e16`**.
- `Δt` = **real on-chain elapsed time** for the period = `block.timestamp − last_settlement`. Never a constant; the demo runs accelerated but `Δt` stays the real measured elapsed time.

- **Per-period net cashflow:** `payment = N × clamp(R − F, ±cap)` (the **credit to the hedger**). Equivalently, the hedger's *outflow* is `N × (F − R)`.
  - **Direction (canonical, from the tested contract):** `net = realized − fixed`. `R > F` → **hedger is credited, the LP (counterparty) pays**; `R < F` → **hedger pays, the LP is credited**. (In `KeelSwap` the counterparty fills the `speculator` parameter slot — in the MVP that address is our LP.) ⚠️ An earlier draft wrote *"F > R → Hedger receives,"* which is **wrong** — it inverts the leg. The shipped contract uses `net = realized − fixed` (hedger = floating receiver), and that is the source of truth.
- **No-default bound:** `maxPeriodAmount = cap × N` — the most that can move in one period. Each side pre-locks at least this (`collateral_min ≥ cap × N`; size to `cap × N × periods_buffered` for a multi-period buffer).
- **Close trigger (→ user confirmation):** close/decide when `remaining_collateral < cap × N` (can't cover one more worst-case period).
- **Final PnL per side:** `Σ over settled periods of N × clamp(R_i − F, ±cap)` (sign per side).
- **Fair fixed rate (advanced):** `F ≈ E[R]` over the tenor, so the swap is zero-expected-value at inception (protocol takes no directional bet).

⚠️ **Unit-consistency invariant (verify in `KeelSwap`):** `R`, `F`, and `cap` **MUST share the same per-period `1e18` scale at the clamp site.** If `cap` (`4e16`) is compared against an `R − F` expressed in any other scale, the clamp **never bites** and the no-default bound silently breaks. This is the single most important thing to confirm in the contract's settlement path.

**Three LOCKED decisions:**
1. **Discrete per-period accumulator — LOCKED (not cumulative).** Settlement is **discrete per period**: a keeper fires `settle()` each period and every period is settled in order. We do **not** use an IPOR-style cumulative funding index (`cumIndex`). The cumulative-index path (realized between two timestamps = `cumIndex_B − cumIndex_A`, enabling lazy/range settlement) is **roadmap**, post-hackathon — not built.
2. **Annualized→per-period conversion happens OFF-CHAIN — LOCKED.** The UI quotes annualized rates, but **CRE/edge code converts to per-period before anything reaches the chain.** The contract receives `R` and `F` **already per-period (signed `1e18`)** and never sees an annualized rate. On-chain math is pure per-period.
3. **`Δt` = real on-chain elapsed time — LOCKED.** `Δt = block.timestamp − last_settlement`, measured on-chain every settlement — **never a hard-coded constant.** The demo compresses wall-clock time, but `Δt` stays the genuine elapsed value, so the numbers reconcile on screen.

---

## 7. User flows
- **Hedger (customer / taker):** open Keel (UI or via the MCP) → see our **offered fixed rate** next to the live floating ticker → **Take / Lock** (confirm the `approve` + `open` in-app) → watch real funding bounce while your rate stays flat → per-period settlement in USDC → close at maturity.
- **Keel LP (us / maker):** quote a **consistent fixed rate** (≈ E[funding] + spread), pre-fund collateral, stand as the counterparty so hedgers lock instantly; at a side's brink, confirm the close / top-up.
- **Speculator — phase 2 (not built):** take the LP's side to bet on funding; the LP then only covers the residual imbalance.

---

## 8. Bounties (verified, all load-bearing)
| Bounty | $ | Why it's *necessary* |
|---|---|---|
| **1inch — Build an Aqua App** | $5,000 | The funding-rate-swap **AMM** + `_fundingSettle` SwapVM opcode (their AMM/Options examples; SwapVM scored higher). |
| **Chainlink — CRE** | $6,000 (3×$2k) | The on-chain **funding-rate oracle** — without it the swap can't settle. Real external-data → DON → on-chain state change. Best, most honest Chainlink fit of the event. |
| **LI.FI — Composer** | $4,000 | Cross-chain collateral onboarding: fund + open the position with USDC from any chain in one Composer flow (fits the Agentic Workflows track via the MCP). *(Owned by the integration lead.)* |

The three pieces are all load-bearing — no "bolted on?" risk: **CRE** brings the funding number, **Aqua** settles it, **LI.FI** brings the capital cross-chain. Pull any one and the product breaks.

---

## 9. The demo (the Ethena replay + a rates trading UI)
**Hero beat — "Relive October 2025, locked vs. unlocked."** Two funds side by side, fed the **real funding-rate crash** on a time-slider: the **unlocked fund's income craters** with funding; the **locked fund stays dead flat.** Hold the diverging lines — *"Same crash. One bled $8B. One didn't feel it."*

**UI form — a focused *lock* UI, NOT a trading terminal.** No orderbook / depth / candlesticks (they misrepresent the matching/AMM model *and* bury the WOW, and you'd have to fake liquidity). Rates-desk *aesthetic*, one-click-lock *interaction*. Four surfaces: a **rates board** (markets → live floating + fixed quotes by tenor, the cheap "this is a market" view), a **lock card** (floating ticker vs fixed quote + Lock-fixed / Take-floating), a **position + hourly-settlement feed**, and the **hero comparison chart**. *(A paste-ready Claude Design prompt for this exists.)*

**The product UI around it:**
1. **Funding-market panel** — live, jumpy **floating ticker** next to our **LP's offered fixed rate**; one **Lock fixed (Take)** button (the customer takes our standing offer).
2. **One-click lock** — *"Locked 10% APR, 30 days, $50k notional"* → a live strip showing real funding moving while your rate is flat.
3. **Hourly settlement, live** — each period the swap settles in **real USDC on Ethereum Sepolia**; show the cashflow + pre-locked collateral → **"no default possible," shown not asserted.** (Demo compresses ~2 min/period so a multi-week hedge fits the slot — documented, not faked.)
4. **The brink decision** — drive a side's collateral to the brink, then show Keel *pause* and surface the close / re-match / continue choice. The MCP agent prepares it; **the user confirms** the decision live. The agent proposes, the human decides — demonstrated, not asserted.

**Real vs scripted:** the AMM quote, the lock, and the hourly USDC settlements are real (testnet); the crash **replay** uses real historical funding data on a slider so a 2-month event fits 60 seconds. Say so.

---

## 10. WOW moments
1. **The Ethena replay** — the trade that would've stopped an $8B bleed, locked-flat vs. floating-crater.
2. **One-click "lock your funding rate"** — a brand-new instrument, made trivial.
3. **Visible no-default settlement** — the "we don't die" claim *demonstrated* hourly, not just stated.
4. **Agent operates, human decides at the brink** — drive Keel live from an agent (the MCP reads funding and opens/settles the swap), then hit the edge: the agent *prepares* the close/re-match/continue call and **hands it to the user to confirm.** In a sea of "fully autonomous agent" demos, the deliberate *agent-proposes-user-confirms* beat lands hardest: the decision that moves money is human.

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
- **NEVER claim "first."** **Rho Protocol is live, funded ($6.34M, CoinFund-led), and institutional** (Rho X + BitGo Go Network, "first institutional on-chain rates market") — it trades perp funding-rate futures + a funding index *today*. Strips pivoted to RabbitX (perp DEX); IPOR pivoted to Fusion (yield vaults); Voltz sunset (→ Reya). **We compete on Aqua-native execution + live collateral + the Ethena demo + the Aqua/CRE/LI.FI bounty fit + the agent-proposes-user-confirms checkpoint — not on novelty.** If a judge names Rho, agree and pivot to "we made it Aqua-native, non-custodial, with collateral that never goes idle."
- **PMF caution:** the lending-rate generation died from weak PMF; Rho validates perp-funding demand *and* is the incumbent. This is an execution + integration play, not a greenfield market.
- **Numbers:** $469T = *notional outstanding* (say "notional"); define/source the on-chain comparison figure precisely (don't get caught by Pendle being billions); the **funding cap + hourly interval are venue-specific** (state the venue, e.g. Hyperliquid hourly).
- **Math decisions — LOCKED (resolved, see §6 *Settlement math*):** (1) **discrete per-period accumulator** (built; cumulative `cumIndex` is roadmap); (2) **annualized→per-period conversion off-chain** (contract only ever sees per-period `R`/`F`, signed `1e18`); (3) **`Δt` = real on-chain elapsed time** (`block.timestamp − last_settlement`, never a constant). Remaining to *verify* in `KeelSwap`: the **unit-consistency invariant** — `R`, `F`, `cap` must share the per-period `1e18` scale at the clamp site, or the clamp never bites.
- **Ethereum Sepolia feasibility:** confirm the **CRE KeystoneForwarder** address on Ethereum Sepolia (else EOA relayer fallback); test USDC (canonical vs `MockUSDC`). EIP-1153 is available (post-Dencun), so the SwapVM opcode runs.
- **First-3-hours validation gate (fail fast):** (1) can CRE fetch Hyperliquid BTC funding and write the index on-chain to the consumer on Ethereum Sepolia? → else EOA relayer fallback. (2) the custom SwapVM opcode → ✅ already built + tested (`packages/swapvm`). (3) can the contract read the index and transfer between two parties in one period? → ✅ proven (`KeelSwap` + opcode e2e). *(Full gate also lives in `docs/build-plan.md`.)*
- **Build long poles (start now):** the `_fundingSettle` opcode + the fixed-rate AMM curve; the CRE funding-oracle workflow; the hourly settlement + collateral/cap loop (✅ M1 settlement core done — 25 tests green).
