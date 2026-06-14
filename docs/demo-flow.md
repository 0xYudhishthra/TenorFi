# TenorFi — Demo Flow & Bounty Integration

> One picture of the end-to-end demo and where each bounty is load-bearing.
> Settlement is **hourly** (matches Hyperliquid funding + the CRE write).

## Flowchart

```mermaid
flowchart TB
  classDef inch fill:#1b1f3b,stroke:#5b6cff,color:#fff
  classDef cl   fill:#0b2545,stroke:#2f80ed,color:#fff
  classDef lifi fill:#2a1a3a,stroke:#b06cff,color:#fff
  classDef hl   fill:#10261f,stroke:#2ecc71,color:#fff
  classDef tf   fill:#2b2310,stroke:#e0a800,color:#fff

  subgraph WEB["Web UI — @tenorfi/web"]
    A1["1 · Connect wallet<br/>(WalletConnect, Base)"]
    A2["2 · Lock 7.3% APR — one signature"]
    A9["9 · Live funding + settlement feed<br/>fixed cost vs variable HL (APR)"]
  end
  class WEB,A1,A2,A9 tf

  subgraph APIG["keel-api orchestrator"]
    B1["POST /hedge — build the two legs"]
    B7["settlement-scheduler (hourly)"]
    B8["execution-node — signs HL actions"]
  end
  class APIG,B1,B7,B8 tf

  subgraph LIFI["LI.FI — Composer + classic  (BOUNTY)"]
    L1["3a · Composer flow on Base<br/>core.rawCall → Aqua.ship"]
    L2["3b · classic — bridge USDC → HyperCore"]
  end
  class LIFI,L1,L2 lifi

  subgraph INCH["1inch Aqua / SwapVM  (BOUNTY)"]
    I1["Aqua + TenorSwapVMRouter"]
    I2["_fundingSettle opcode<br/>net = clamp(R−F, ±cap) × N"]
    I3["FundingIndex (write-once, hourly)"]
  end
  class INCH,I1,I2,I3 inch

  subgraph CL["Chainlink CRE  (BOUNTY)"]
    C1["5 · CRE workflow<br/>HL funding → DON median"]
    C2["KeystoneForwarder →<br/>KeelFundingReceiver.onReport"]
  end
  class CL,C1,C2 cl

  subgraph HLG["Hyperliquid"]
    H1["BTC perp position"]
    H2["funding rate (hourly source)"]
    H3["isolated margin"]
  end
  class HLG,H1,H2,H3 hl

  %% Onboarding — one signature opens both legs
  A1 --> A2 --> B1
  B1 -->|open leg| L1 --> I1
  B1 -->|deposit leg| L2 --> H1
  B1 --> B8 -->|"4 · open perp"| H1

  %% Funding oracle — standing, hourly
  H2 --> C1 --> C2 --> I3

  %% Settlement — hourly
  B7 -->|"6 · router.swap"| I2
  I2 -->|reads| I3
  I2 -->|"7 · R below F: premium pulled / R above F: coverage paid (USDC)"| I1
  I2 -->|"R above F: coverage"| B8
  B8 -->|"8 · topUpMargin"| H3

  %% UI reflects
  I3 --> A9
  I1 --> A9
```

## The beats (what the audience sees)

| # | Beat | Component |
|---|------|-----------|
| 1–2 | Connect wallet, **Lock 7.3% APR** in one signature | Web UI + WalletConnect |
| 3a | **Composer** flow opens the subscription on Base — `core.rawCall`s Aqua's `ship` | **LI.FI Composer** → **1inch Aqua** |
| 3b | **classic** bridges USDC to HyperCore (Composer can't reach non-EVM HyperCore) | **LI.FI classic** |
| 4 | execution-node opens the BTC perp | Hyperliquid |
| 5 | **CRE** writes BTC funding hourly → `FundingIndex` on Base | **Chainlink CRE** |
| 6 | settlement-scheduler fires `router.swap` each hour | keel-api → **1inch SwapVM** |
| 7 | `_fundingSettle` settles: **R>F** reserve covers (paid out) / **R<F** premium pulled — real USDC | **1inch Aqua** |
| 8 | On coverage, the payout **tops up the subscriber's HL margin** (hedge stays funded) | keel-api → Hyperliquid |
| 9 | UI shows variable HL funding smoothed to a **flat fixed cost** | Web UI |

## Bounty integration — all three are load-bearing

| Bounty | Role in the flow | Where |
|--------|------------------|-------|
| **1inch — Build an Aqua App** | The settlement engine: a custom `_fundingSettle` SwapVM opcode on our own router settles fixed-vs-floating each period over Aqua, zero subscriber collateral. Composer's `rawCall` also opens the position *through* Aqua. | `packages/contracts/src/swapvm` |
| **Chainlink — CRE** | The funding-rate oracle that doesn't otherwise exist: reads Hyperliquid funding, DON consensus, writes the on-chain `FundingIndex` the opcode reads. Without it nothing can settle. | `packages/cre/keel-funding` |
| **LI.FI — Composer** | One-signature onboarding. **Composer** builds the Base leg that interacts with our Aqua contract (`core.rawCall → ship`); **classic** handles the HyperCore bridge. The split is deliberate — Composer can't reach non-EVM HyperCore. | `packages/lifi` (`open.ts` Composer · `classic/`) |

Pull any one and the product breaks: **CRE** brings the number, **Aqua** settles it, **LI.FI** brings the capital and opens the position. Hyperliquid is the funding source + the perp venue (not a bounty target).
