# TenorFi — Pitch & Narrative (ETHGlobal New York 2026)

> The stage script and the story behind it. **Format:** ~30s problem (slides) + ~90s live demo.
> **Delivery language: English.** Source of truth for the product is [`design-doc.md`](design-doc.md);
> this file is the *narrative* layer — what we say, in what order, and how we defend it.
>
> **One rule above all: be honest on stage.** Every number here is checked against the build. The live
> swap and settlement are real on **Base mainnet**; the crash figures are real historical data; the
> realized funding value in the demo is *injected* (what CRE would post from Hyperliquid). We say which is
> which. Honesty is what survives the Q&A.
>
> ⚠️ **Model note (internal):** TenorFi is the **subscription** model — **no user collateral**; Aqua pulls a
> **fixed premium** from the wallet as you go, and the reserve covers the funding. The **on-chain tick in
> the demo currently runs the deployed *net* settlement** (economically identical per period); don't claim
> the premium-pull split is fully live on-chain until the contracts ship. Frame "zero collateral" as the
> product; show the net tick as the working settlement.

---

## 0. One-liner (say this if someone asks "what is it?")

> **TenorFi is the interest-rate swap for perp funding — it turns the variable funding rate into a fixed
> one, in one click. The unhedgeable cost that keeps institutions out of perps, made fixed — with zero
> collateral: a small fixed premium is pulled from your wallet as you go. (Like insurance for your funding
> rate.)**

Positioning (internal): we are **not the first** funding-rate swap (Strips, Rho, IPOR exist). We win on
**framing + execution** — *the interest-rate swap that makes perps institutional*, Aqua-native, **zero
collateral** (pay as you go), and an agent front door. If a judge names a competitor, we agree and
pivot to *"and we made it Aqua-native, non-custodial, zero-collateral — and we point it at the people who
can't hold perps today: institutions."*

---

## 1. The 30-second problem (slides)

**The hook — Oct 10, 2025 (the shock):**
> "On October 10th, 2025, about **$19 billion** was liquidated in a single day — the largest liquidation
> event in crypto history. The trigger was a price crash, but the thing that kept bleeding traders dry is
> invisible: every hour you hold a perpetual, you pay a variable fee called the **funding rate**. When the
> market convulses, that fee spikes and quietly drains your margin until you're liquidated."

**The rhyme — 1981 (we have seen this movie):**
> "And we've seen this before. In **1981**, Paul Volcker took interest rates to **~20%**, and America's
> savings institutions collapsed — **over a thousand** of them. They'd borrowed at a **variable** rate and
> lent at a **fixed** one; when the variable cost blew past the fixed, they were insolvent. Death by a
> variable rate nobody could lock."

**The famous victim — Ethena (it's not a one-day fluke):**
> "It still happens. **Ethena** — the 'safest, sleep-at-night' strategy in crypto — went from about **$16
> billion to $5 billion** when its funding income collapsed. No hack. No theft. Its income was variable,
> and nobody could lock it."

**The fix that built a market — and why now:**
> "TradFi's answer was the **interest-rate swap**: trade variable for fixed. Once the risk was hedgeable,
> the instrument became *investable for institutions* — today it's a **$469 trillion** market, the largest
> on earth. Crypto generates **$60 trillion+** of this exact risk a year, and yet **institutions still
> can't touch perps** — the funding rate is a variable cost no risk desk will hold. Perps are stuck where
> the economy was before 1981."

> **Honesty guardrail (internal):** say "**~$19 billion**" (not "trillion", not "million"). Funding is
> **the recurring cost TenorFi fixes** — do **not** claim funding alone "caused" the $19B (the trigger was
> price + cascading liquidations). For 1981, say "**over 1,000** S&Ls/savings institutions failed" and
> "Volcker → **~20%**" — real and sourced (Federal Reserve History; Econlib). Say "$469 **trillion**
> notional" (BIS/ISDA, **mid-2024** — don't round to $500T). This precision is what makes you
> un-rattle-able.

---

## 2. The solution (the bridge into the demo, ~15s)

> "**TenorFi is the interest-rate swap for perp funding** — it fixes your funding rate in one click.
> Mechanically it's like insurance: you pay a fixed premium, and TenorFi covers your actual funding — so
> your cost stays pinned no matter what funding does. And here's the kicker: **you lock up nothing.**
> **1inch Aqua** pulls the small fixed premium from your wallet as you go. This is the line item that lets a
> desk finally hold a perp. Let me show you — driven by an agent."

**The core insight (have this ready, it disarms the #1 confusion):** *you post no collateral.* TenorFi
covers your variable funding for a fixed price; **1inch Aqua pulls that fixed premium straight from your
wallet, just-in-time each hour** — nothing is locked. TenorFi reads the funding rate on-chain (Chainlink)
to know exactly what to cover, like health insurance paying your variable bill for a fixed premium.

---

## 3. The conceptual WOW — the cancellation

This is the strongest single idea in the pitch. Say it plainly:

> "TenorFi covers whatever funding turns out to be, and you pay a fixed premium — so all that's left is the
> fixed rate. **Same crash: one position bled, the other didn't feel it. Your cost didn't move a single
> point — and you locked up nothing.**"

```
Funding owed on Hyperliquid:  − variable funding
TenorFi covers it:            + variable funding
You pay TenorFi (premium):    − fixed
                              ─────────────────────────────
Net:                          − fixed   (constant, hedged)
```

---

## 4. The live demo (~90s, agent-driven)

**Form:** the **agent chat** is the star; a **minimal one-screen panel** (reads on-chain) shows the position,
the **next premium**, **AFR vs FFR** live, and the settlement feed. No fake orderbook, no candlesticks.

**Scope shown live:** open the position + **one real settlement tick**. The infinite loop and the
brink/human checkpoint are narrated as roadmap, not performed.

| AFR / FFR | meaning |
|---|---|
| **AFR** = Actual Funding Rate (realized, from Chainlink/Hyperliquid) | what the market charged this period |
| **FFR** = Fixed Funding Rate (the locked rate) | what you agreed to pay |

**Beat 1 — Open by conversation.**
> *User → agent:* "Open a $5,000 BTC long on Hyperliquid and fix my
> funding rate."
> *Agent:* "Your fixed rate is **7.3% APR** — the fair rate, from a year of real BTC funding. Coverage
> auto-scales to **1.5% of your position** — for $5,000 that's **$75** the reserve pre-funds. Sign once."
> *User:* "Do it." → *Agent:* "Done — sign once."

**Beat 2 — One click, no collateral (LI.FI Composer).** On that one signature, a LI.FI Composer Flow brings
the user's USDC, **funds the Hyperliquid perp**, and **activates the subscription** (authorizes Aqua to
pull the premium) — **nothing is deposited into TenorFi as collateral**. The panel shows: HL position open,
subscription active, **FFR = 7.3%**, **AFR live**, next premium.
> *(Honesty: LI.FI funds the perp and the user authorizes the premium pull; the perp order itself is fired
> by the agent via the Hyperliquid API in the same flow. We don't say "LI.FI places the perp.")*

**Beat 3 — The settlement tick (the heart).** Chainlink CRE posts the period's funding to the on-chain
index (via `KeelFundingReceiver.onReport`); the keeper fires the settlement. On screen: **real USDC moves
on Base — TenorFi covers your funding**, routed to top up the Hyperliquid margin, while the fixed premium is
pulled from your wallet.
> "Funding drained your margin — TenorFi just refilled it. You paid only the fixed rate, and locked up
> nothing."
> *(On-chain this tick runs the deployed **net** settlement — economically the same per period; see the
> model note at the top.)*

**Beat 4 — Honesty line (on screen).** Real: the swap, the settlement, the USDC movement (Base mainnet).
Injected: the AFR value (what CRE posts from Hyperliquid — scripted to show the coverage). Historical: the
Oct-10 / Ethena figures.

**Beat 5 — Roadmap tease (narrated, ~5s).** "This runs every hour until you close. And when your wallet
can't fund the next premium, the agent **proposes** the choice — close, re-match, or top up — and a
**human confirms**. The decision that moves money is made by a person."

---

## 5. Soundness — the "is this a Ponzi?" answer (have it loaded)

> "We're not betting. The coverage — **1.5% of your position** (for a $5k long, $75) — is the **ceiling
> of the insurance**. The
> protocol **pre-funds** that coverage in a reserve, and funding is **capped per period** — so the worst
> case for any single hour is **already funded up front**. **No default, by design.** And the user holds
> nothing to lose: there's no collateral to drain — if their wallet can't fund the next small premium, only
> their own position closes."

In the demo, the insurance reserve is a **team-controlled, pre-funded wallet** — that's why "TenorFi covers
your funding" is real: the money is already there.

---

## 6. Credibility beats (what separates us from the pile)

Drop one or two of these when relevant — they're true and they land:

- **"Our settlement opcode runs against the real, deployed 1inch Aqua and real USDC — on a Base mainnet
  fork, not a mock."** (`test/swapvm/BaseMainnetFork.t.sol`)
- **"39 passing tests, a Slither pass, and an adversarial security audit that found and fixed two high-severity
  bugs"** (an order anyone could take to steal the payout; a sign-drop that made the maker pay both ways).
  See [`security-review.md`](security-review.md).
- **"The funding oracle is a real Chainlink CRE consumer"** (`KeelFundingReceiver` implements the canonical
  `IReceiver.onReport`), not a UI reading a feed.

---

## 7. The three integrations — each is load-bearing (pull one → it breaks)

| Sponsor | One line | Why it's necessary |
|---|---|---|
| **1inch Aqua / SwapVM** | "The engine — the swap literally *is* our custom `_fundingSettle` opcode, and Aqua pulls the fixed premium from your wallet just-in-time, so you lock up nothing." | No Aqua → no settlement venue and no zero-collateral premium pull (our whole edge). |
| **Chainlink CRE** | "The thermometer — reads Hyperliquid funding, reaches DON consensus, writes it on-chain." | No CRE → there's no funding number to settle against. |
| **LI.FI Composer** | "The on-ramp — one click brings USDC cross-chain, funds the perp, and starts the subscription." | No LI.FI → the user assembles it by hand across two venues. |

*Pitch to 1inch specifically:* "We didn't bolt Aqua onto a swap — we built a **periodic-settlement
derivative inside SwapVM**, where the user posts no collateral and Aqua pulls the premium as you go. Aqua
doing something it was never shown doing."

---

## 8. Q&A defense (anticipate and pre-empt)

- **"This already exists / aren't you just X?"** → "Yes — Rho is live and funded (~$6.34M, CoinFund-led),
  Strips and IPOR exist. We're not claiming first. We compete on **Aqua-native execution, zero user
  collateral (pay as you go), and the agent front door** — and on **framing**: nobody else pitches this as
  *the interest-rate swap that makes perps investable for institutions*. They sell a funding hedge to
  traders; we sell the on-ramp that lets a risk desk hold a perp at all." (**Never say "first."**)
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
> until you're liquidated. We've seen this movie: in **1981**, Volcker took rates to 20% and **over a
> thousand** savings institutions died — they earned fixed and paid variable, and nobody could lock it.
> TradFi's fix was the **interest-rate swap** — trade variable for fixed — and it became a **$469-trillion**
> market, the largest on earth, because it made the risk *investable for institutions*. Crypto runs $60
> trillion+ of this exact risk a year, and yet institutions still can't hold perps — for one reason: the
> funding rate.
>
> **TenorFi is that swap for perps — it turns variable funding into a fixed rate, in one click, with zero
> collateral:** 1inch Aqua pulls a small fixed premium from your wallet as you go, and we cover your
> funding. We don't bet. The coverage is pre-funded and funding is capped, so the worst case is already
> paid — no default by design. It settles every period against a Chainlink funding feed, and an agent
> drives the whole thing. Watch the trade that would have saved Ethena — live, on Base."

**Closing line (pick by room):**
> "**Lock the rate that broke the safest fund in crypto.**"
> *(institutional)* "**Every market that grew up got an interest-rate swap. Perps just got theirs.**"

---

## 10. Slides — deferred (next pass)

Slides are intentionally **not built yet**. When we do them: **TenorFi-own brand, "noir financiero"**
(dark, rates-desk aesthetic, clean and serious — not a personal brand). This file is the script/source.
The slide spine should mirror §1 → §2 → §3, then cut to the live demo (§4); §5–§8 are spoken, not slides.
