# Keel — Pitch & Narrative (ETHGlobal New York 2026)

> The stage script and the story behind it. **Format:** ~30s problem (slides) + ~90s live demo.
> **Delivery language: English.** Source of truth for the product is [`design-doc.md`](design-doc.md);
> this file is the *narrative* layer — what we say, in what order, and how we defend it.
>
> **One rule above all: be honest on stage.** Every number here is checked against the build. The live
> swap, collateral, and settlement are real on **Base mainnet**; the crash figures are real historical
> data; the realized funding value in the demo is *injected* (what CRE would post from Hyperliquid). We
> say which is which. Honesty is what survives the Q&A.

---

## 0. One-liner (say this if someone asks "what is it?")

> **Keel lets you lock your perp funding rate — variable to fixed — in one click, like insurance, with
> collateral that keeps earning while it covers you.**

Positioning (internal): we are **not the first** funding-rate swap (Strips, Rho, IPOR exist). We win on
**execution** — Aqua-native, collateral that never goes idle, and an agent (MCP) front door. If a judge
names a competitor, we agree and pivot to *"and we made it Aqua-native, non-custodial, with collateral
that never sleeps."*

---

## 1. The 30-second problem (slides)

**The hook — Oct 10, 2025 (the shock):**
> "On October 10th, 2025, about **$19 billion** was liquidated in a single day — the largest liquidation
> event in crypto history. The trigger was a price crash, but the thing that kept bleeding traders dry is
> invisible: every hour you hold a perpetual, you pay a variable fee called the **funding rate**. When the
> market convulses, that fee spikes and quietly drains your margin until you're liquidated."

**The famous victim — Ethena (it's not a one-day fluke):**
> "This isn't new. **Ethena** — the 'safest, sleep-at-night' strategy in crypto — went from about **$16
> billion to $5 billion** when its funding income collapsed. No hack. No theft. Its income was variable,
> and nobody could lock it."

**Why it matters / why now:**
> "TradFi solved this 40 years ago with the interest-rate swap — a **$469 trillion** market by notional.
> Crypto generates **$60 trillion+** of this risk a year, and the safety net is still nascent."

> **Honesty guardrail (internal):** say "**~$19 billion**" (not "trillion", not "million"). Funding is
> **the recurring cost Keel fixes** — do **not** claim funding alone "caused" the $19B (the trigger was
> price + cascading liquidations). Say "$469 **trillion** notional." This precision is what makes you
> un-rattle-able.

---

## 2. The solution (the bridge into the demo, ~15s)

> "**Keel** lets you fix your funding rate in one click — like buying insurance. You pay a fixed rate; if
> real funding spikes, the protocol pays you the difference and tops your margin back up; if funding stays
> calm, you pay the premium. **Your cost stays pinned.** And your collateral isn't dead money — it earns
> yield in **1inch Aqua** while it backs the swap. Let me show you — driven by an agent."

**The core insight (have this ready, it disarms the #1 confusion):** *Keel never touches your Hyperliquid
position.* It's a separate contract that settles against a **public number** — the funding rate, read by
Chainlink — exactly like rain insurance pays on rainfall without controlling the weather. That's why we
don't need to build a perp DEX.

---

## 3. The conceptual WOW — the cancellation

This is the strongest single idea in the pitch. Say it plainly:

> "When you hold the perp **and** the Keel swap, the funding you pay cancels against what Keel pays you —
> and all that's left is the fixed rate. **Same crash: one position bled, the other didn't feel it. Your
> cost didn't move a single point.**"

```
You pay on Hyperliquid:   − floating funding
Keel pays you:            + floating funding − fixed
                          ─────────────────────────────
Net:                      − fixed   (constant, hedged)
```

---

## 4. The live demo (~90s, agent-driven)

**Form:** the **MCP chat** is the star; a **minimal one-screen panel** (reads on-chain) shows the position,
the Aqua collateral, **AFR vs FFR** live, and the settlement feed. No fake orderbook, no candlesticks.

**Scope shown live:** open both legs + **one real settlement tick**. The infinite loop and the brink/human
checkpoint are narrated as roadmap, not performed.

| AFR / FFR | meaning |
|---|---|
| **AFR** = Actual Funding Rate (realized, from Chainlink/Hyperliquid) | what the market charged this period |
| **FFR** = Fixed Funding Rate (the locked rate) | what you agreed to pay |

**Beat 1 — Open by conversation.**
> *User → agent (Claude Code / Codex / any MCP client):* "Open a $5,000 BTC long on Hyperliquid and fix my
> funding rate."
> *MCP:* "Here are three fixed rates: 1) **5% fixed, $25k max coverage** · 2) 10% fixed, $50k · 3) 15%
> fixed, $100k."
> *User:* "The 5% one." → *MCP:* "Done — sign once."

**Beat 2 — Two legs, one click (LI.FI Composer).** On that one signature, a LI.FI Composer Flow brings the
user's USDC and opens **both** legs: the Hyperliquid perp deposit *and* the Keel swap. The collateral now
lives in **Aqua, earning yield** while it insures. The panel shows: HL position open, Keel position open,
collateral in Aqua, **FFR = 5%**, **AFR live**.
> *(Honesty: LI.FI deposits the collateral into both legs; the perp order itself is fired by the MCP via
> the Hyperliquid API in the same flow. We don't say "LI.FI places the perp.")*

**Beat 3 — The settlement tick (the heart).** Chainlink CRE posts the period's funding to the on-chain
index (via `KeelFundingReceiver.onReport`); the keeper fires `settle()`. On screen: **AFR > FFR → the
protocol pays the user real USDC**, routed to top up the Hyperliquid margin.
> "Funding drained your margin — Keel just refilled it. Your cost didn't move."

**Beat 4 — Honesty line (on screen).** Real: the swap, the collateral in Aqua, the settlement, the USDC
movement (Base mainnet). Injected: the AFR value (what CRE posts from Hyperliquid — scripted high to show
the `AFR > FFR` payout). Historical: the Oct-10 / Ethena figures.

**Beat 5 — Roadmap tease (narrated, ~5s).** "This runs every hour until you close. And when collateral
nears its limit, the agent **proposes** the choice — close, re-match, or top up — and a **human confirms**.
The decision that moves money is made by a person."

---

## 5. Soundness — the "is this a Ponzi?" answer (have it loaded)

> "We're not betting. The **'5% fixed / $25k coverage'** is the **ceiling of the insurance**. The
> protocol **pre-funds** that coverage in a reserve, and funding is **capped per period** — so the worst
> case for any single hour is **already paid up front**. Settlement only *moves* collateral between the
> two sides; nothing is created. **No default, by design.** If one side is drained, only that side closes
> and the other is paid in full."

In the demo, the insurance reserve is a **team-controlled, pre-funded wallet** — that's why "the protocol
pays you" is real: the money is already there.

---

## 6. Credibility beats (what separates us from the pile)

Drop one or two of these when relevant — they're true and they land:

- **"Our settlement opcode runs against the real, deployed 1inch Aqua and real USDC — on a Base mainnet
  fork, not a mock."** (`test/swapvm/BaseMainnetFork.t.sol`)
- **"50 tests, a Slither pass, and an adversarial security audit that found and fixed two high-severity
  bugs"** (an order anyone could take to steal the payout; a sign-drop that made the maker pay both ways).
  See [`security-review.md`](security-review.md).
- **"The funding oracle is a real Chainlink CRE consumer"** (`KeelFundingReceiver` implements the canonical
  `IReceiver.onReport`), not a UI reading a feed.

---

## 7. The three integrations — each is load-bearing (pull one → it breaks)

| Sponsor | One line | Why it's necessary |
|---|---|---|
| **1inch Aqua / SwapVM** | "The engine — the swap literally *is* our custom `_fundingSettle` opcode, and collateral stays alive as Aqua virtual balances." | No Aqua → no settlement venue and the collateral goes dead (our whole edge). |
| **Chainlink CRE** | "The thermometer — reads Hyperliquid funding, reaches DON consensus, writes it on-chain." | No CRE → there's no funding number to settle against. |
| **LI.FI Composer** | "The on-ramp — one click brings USDC cross-chain and opens **both** legs of the hedge." | No LI.FI → the user assembles the hedge by hand across two venues. |

*Pitch to 1inch specifically:* "We didn't bolt Aqua onto a swap — we built a **periodic-settlement
derivative inside SwapVM**, with collateral that never goes idle. Aqua doing something it was never shown
doing."

---

## 8. Q&A defense (anticipate and pre-empt)

- **"This already exists / aren't you just X?"** → "Yes — Rho is live and funded (~$6.34M, CoinFund-led),
  Strips and IPOR exist. We're not claiming first. We compete on **Aqua-native execution, collateral that
  never goes idle, and the agent front door.**" (**Never say "first."**)
- **"Who takes the other side / how do you not blow up?"** → §5: bounded, pre-funded, capped per period,
  no default by design. As the insurer (the reserve) we take **bounded** directional risk (capped per
  period, not zero) — own it; it's Voltz-style and fine.
- **"What if the oracle stalls?"** → "Settlement pauses for that period; funds are safe, not lost. The CRE
  receiver has an EOA relayer fallback for liveness." (Honest residual risk: oracle staleness, correlated
  collateral.)
- **"What's real vs scripted?"** → Beat 4. Say it before they ask.
- **"Real funds on Base mainnet?"** → "Yes — Base mainnet, so we keep position sizes small for the live
  test; the mechanism is identical at any size."

---

## 9. Pitch script — full read (≤60s)

> "On October 10th, 2025, **$19 billion** was liquidated in a day — the biggest in crypto history. The
> trigger was a crash, but the cost that keeps draining traders is invisible: the **funding rate**, the
> variable fee you pay every hour to hold a perp. When markets convulse, it spikes and bleeds your margin
> until you're liquidated. **Ethena**, the safest strategy in crypto, shrank from **~$16 billion to ~$5
> billion** the same way — its income was variable and nobody could lock it. TradFi fixed this 40 years
> ago with the
> interest-rate swap — a **$469-trillion** market.
>
> **Keel lets you lock your funding rate, variable to fixed, in one click — like insurance — and your
> collateral never goes idle: it earns yield in 1inch Aqua while it covers you.** We don't bet. The
> coverage is pre-funded and funding is capped, so the worst case is already paid — no default by design.
> It settles every period against a Chainlink funding feed, and an agent drives the whole thing through an
> MCP. Watch the trade that would have saved Ethena — live, on Base."

**Closing line:**
> "**Lock the rate that broke the safest fund in crypto.**"

---

## 10. Slides — deferred (next pass)

Slides are intentionally **not built yet**. When we do them: **Keel-own brand, "noir financiero"**
(dark, rates-desk aesthetic, clean and serious — not a personal brand). This file is the script/source.
The slide spine should mirror §1 → §2 → §3, then cut to the live demo (§4); §5–§8 are spoken, not slides.
