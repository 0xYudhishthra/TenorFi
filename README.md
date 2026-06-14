# TenorFi

> **The interest-rate swap for perps.** On-chain fixed-funding-rate swaps — built natively on 1inch Aqua, with collateral that never goes idle. Turn your *variable* perp funding into a *fixed* rate in one click — the unhedgeable cost that keeps institutions out of perps, made fixed.

- **Design doc** (source of truth): [`docs/design-doc.md`](docs/design-doc.md)
- **Bounty integrations** (1inch · Chainlink · LI.FI — diagrams + code): [`docs/bounty-integrations.md`](docs/bounty-integrations.md)
- **Security review** (Slither triage + on-chain checks): [`docs/security-review.md`](docs/security-review.md)
- **Settlement core**: [`packages/contracts`](packages/contracts) · **Aqua opcode**: [`packages/contracts/src/swapvm`](packages/contracts/src/swapvm)

---

## The problem

Perpetual-futures *funding* is the floating fee traders pay or earn every hour. It swings violently and nobody can lock it in — the variable cost that gutted Ethena (~$16.6B → ~$5.6B as its funding yield collapsed). **It's also why institutions can't enter perps:** an open-ended variable cost is uninvestable — no risk desk holds a carry that can spike 10× in a day and can't be hedged.

TradFi ran this exact movie in 1981: savings institutions earned fixed and paid variable; when Volcker took rates to ~20%, the variable cost outran the fixed yield and **over a thousand of them failed.** The fix was the **fixed-for-floating interest-rate swap** — and once the risk was hedgeable it became *investable for institutions*, now **~$469T notional**, the largest market on earth. **Oct 10, 2025 (~$19B liquidated) is the Volcker shock of perps.** Crypto built $60T+/yr of this risk; the safety net is still nascent.

## The solution

TenorFi is **the interest-rate swap for perps: variable → fixed**. It never touches your Hyperliquid position — it settles against a *public number* (the funding rate, read by Chainlink CRE), like rain insurance pays on rainfall without controlling the weather. Turn the one cost a risk desk can't hold into a fixed line item, and a $60T+ market opens to institutional capital.

- **Hedger (the customer / taker)** — a leveraged perp long. Pays fixed, receives floating → their variable funding is cancelled, leaving a flat locked rate. Takes our offer in one click.
- **Insurance reserve (us / maker)** — quotes a consistent fixed rate and stands as the counterparty, so a hedger locks instantly. Receives fixed, pays floating; earns the premium when funding stays calm, pays out (bounded per period) when it spikes.
- **The protocol stays neutral** — the contract only custodies and settles; the reserve provides the liquidity, exactly as an exchange is neutral while market-makers quote. *(Speculators that take the reserve's side are phase 2.)*

## How the swap works

TenorFi is a **subscription** — the hedger posts **zero collateral**. A **single** `_fundingSettle` SwapVM order settles both directions each period, scaling the per-hour net to the settlement window. The funding rate `R` and fixed rate `F` are quoted **per hour** (Hyperliquid's funding interval); the opcode scales by `periodSeconds / 3600`. The demo runs **hourly** (`periodSeconds = 3600`), so the scale is **×1** — each settlement is one full hour:

```
net = clamp(R − F, ±cap) × notional × periodSeconds / 3600
  R > F  → reserve covers the gap (amountOut, paid from its shipped Aqua balance) → hedger
  R < F  → premium pulled from the hedger's wallet just-in-time (amountIn) → reserve (1-wei marker receipt)
```

**No default, by design:** funding is capped per period and the reserve pre-funds at least one period's worst case (`cap × notional`). The hedger holds nothing to lose — they post no collateral; the small fixed premium is pulled from their wallet only when due. If their wallet can't fund the next pull, only the position closes.

## The brink decision

When the hedger's wallet can no longer fund the next premium pull, TenorFi does not close blindly. The agent prepares the choice — **close · re-match · continue (top up)** — and the user confirms it. *Agent proposes, user confirms:* the decision that moves money at the brink is made by a person.

## Integrations

| Component | What it does | Where |
|-----------|--------------|-------|
| **1inch Aqua / SwapVM** | Custom `_fundingSettle` instruction: a single order settles both directions per period — coverage (`amountOut`) when `R > F`, premium pulled from the wallet (`amountIn`) when `R < F`; zero subscriber collateral | `packages/contracts/src/swapvm` |
| **Chainlink CRE** | Funding-rate oracle: reads Hyperliquid BTC funding → DON consensus → on-chain `FundingIndex` | `packages/cre/keel-funding` · [`docs/bounty-integrations.md`](docs/bounty-integrations.md) |
| **LI.FI Composer** | Cross-chain collateral onboarding: fund + open the hedge with USDC from any chain | (integration lead) |
| **Settlement** | `_fundingSettle` SwapVM opcode over Aqua (no custodial contract — collateral stays live) + `FundingIndex` (write-once latch) | `packages/contracts/src` |

## Architecture

```mermaid
flowchart TB
    HEDGER["Hedger / taker"] -->|takes our rate| TENORFI
    RESERVE["Insurance reserve / maker — quotes the fixed rate"] --> TENORFI
    CRE["Chainlink CRE<br/>Hyperliquid funding → DON → KeystoneForwarder → KeelFundingReceiver.onReport"] -->|funding index| TENORFI
    LIFI["LI.FI Composer<br/>USDC collateral, cross-chain"] --> TENORFI
    TENORFI["TENORFI swap — 1inch Aqua / SwapVM (Base mainnet)<br/>custom _fundingSettle opcode · collateral stays live via Aqua virtual balances"]
    TENORFI -->|settle / payout USDC| OUT["Hedger ↔ reserve via Aqua virtual balances"]
    TENORFI -.->|premium-low| BRINK["User confirms via the agent<br/>close / re-match / continue"]
```

## The settlement loop

```mermaid
flowchart TB
    A["Hyperliquid BTC funding (hourly — the public number)"] -->|"CRE: fetch → DON → KeystoneForwarder → KeelFundingReceiver.onReport"| B["FundingIndex.setFundingIndex(period, R)<br/>on Base mainnet"]
    B -->|"keeper fires settle each period"| C["_fundingSettle opcode (over Aqua)<br/>net = clamp(R − F, ±cap) × N"]
    C --> D["USDC moves hedger ↔ reserve via Aqua virtual balances<br/>(collateral never locked)"]
```

## Status

| Component | Status | Where |
|-----------|--------|-------|
| Settlement — custom SwapVM opcode (`_fundingSettle` + router + program) over Aqua | **Built · unit + e2e + Base-mainnet fork** (settlement moves real USDC via Aqua) · double-settle guarded · no-default proven; Base mainnet deploy pending | `packages/contracts/src/swapvm` |
| Funding latch (`FundingIndex`, write-once) | **Built** | `packages/contracts/src` |
| Chainlink CRE consumer (`KeelFundingReceiver` onReport → FundingIndex) | **Built · 14 tests** | `packages/contracts/src` |
| Deploy script + wiring test (Base mainnet) | **Built · 1 test** | `packages/contracts/script` |
| Chainlink CRE funding oracle (Hyperliquid → DON → on-chain) | **Built · live write verified on Base mainnet** | `packages/cre/keel-funding` |
| LI.FI cross-chain onboarding | Planned | integration lead |
| TenorFi agent front door | Planned (M7) | `packages/agent` |
| Web app (lock UI + Ethena replay) | Planned (M5) | `apps/web` |
| Base mainnet deployment (funding stack) | **Live** — see below | `packages/contracts/deployments.json` |

## Live deployment (Base mainnet, chain id 8453)

The Chainlink CRE funding stack is deployed and the end-to-end write is verified on-chain: the CRE workflow read real Hyperliquid BTC funding, reached consensus, and wrote it through the forwarder into `FundingIndex`.

| Contract | Address |
|----------|---------|
| `TenorSwapVMRouter` (our SwapVM router) | [`0xba93ebc0A6a24980703423C3CE729F15eEDA099B`](https://basescan.org/address/0xba93ebc0A6a24980703423C3CE729F15eEDA099B) |
| `TenorFundingProgram` (the settlement program) | [`0xd04Aa86aB1bd11834931b667f918B945f6556174`](https://basescan.org/address/0xd04Aa86aB1bd11834931b667f918B945f6556174) |
| Position token (1-wei marker receipt) | [`0x7c055823cfe08841a1b3F73e56C86183bc859132`](https://basescan.org/address/0x7c055823cfe08841a1b3F73e56C86183bc859132) |
| `KeelFundingReceiver` (CRE `onReport` consumer) | [`0x7b7Ca2269f865C3448015173D433CcD7782aF582`](https://basescan.org/address/0x7b7Ca2269f865C3448015173D433CcD7782aF582) |
| `FundingIndex` (write-once funding latch) | [`0x545f162204A92CEbeb12AA0A4AaDF777d6905005`](https://basescan.org/address/0x545f162204A92CEbeb12AA0A4AaDF777d6905005) |
| Settlement token | **canonical Base USDC** [`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) — real USDC *(an early `MockUSDC 0x3A51…c6e8` is superseded/unused; CRE never used a token)* |
| **Production** KeystoneForwarder (CRE DON path) | [`0xF8344CFd5c43616a4366C34E3EEE75af79a74482`](https://basescan.org/address/0xF8344CFd5c43616a4366C34E3EEE75af79a74482) |
| Simulation `MockForwarder` (rotatable; sim `--broadcast`) | `0x5e342a8438b4f5d39e72875fcee6f76b39cce548` |

Verified CRE write — tx [`0xd1b1e41b545a273e29f36a5f40f1238b0f32a3464bf7bc0698dcba78ff7e87f2`](https://basescan.org/tx/0xd1b1e41b545a273e29f36a5f40f1238b0f32a3464bf7bc0698dcba78ff7e87f2): `FundingIndex.getFundingIndex(494834)` returns `(12500000000000, true)` — Hyperliquid BTC funding `0.0000125` scaled to 1e18. The full stack (funding latch + CRE receiver + SwapVM router + program + position token) deploys in one shot via `script/Deploy.s.sol`. *(A fresh deploy yields a new `KeelFundingReceiver` — repoint the CRE workflow's `receiverAddress` and re-deploy it.)*

## Repository layout

```
keel/
├── docs/                 # design doc (source of truth), bounty + CRE notes, hackathon roadmap
├── packages/
│   ├── contracts/        # Foundry (single env) — funding latch + CRE receiver (src/) + SwapVM settlement opcode (src/swapvm/) + deploy (script/)
│   ├── cre/              # Chainlink CRE workflow (TypeScript/bun): Hyperliquid funding → DON → on-chain index
│   ├── keeper/           # per-period settle() trigger
│   └── agent/            # TenorFi agent: read funding + operate the swap; brink → user confirm
└── apps/
    └── web/              # lock UI + the Ethena replay demo
```

## Quickstart

Everything is one Foundry package:

```bash
cd packages/contracts
pnpm install          # @1inch/swap-vm + @1inch/aqua (needed to build the SwapVM opcode)
forge test            # 39 passing (43 total, 4 fork tests skipped without an RPC)
# integration vs the real deployed Aqua + USDC on a Base mainnet fork (runs the skipped fork tests):
BASE_RPC_URL=https://mainnet.base.org forge test --match-contract BaseMainnetFork
```

Deploy to Base mainnet:

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
# writes deployments.json
```

## Tech stack

| Layer | Choice |
|-------|--------|
| Settlement contracts | Solidity 0.8.30, Foundry |
| Aqua app | 1inch SwapVM custom instruction (Foundry) |
| Funding oracle | Chainlink CRE (reads Hyperliquid funding) |
| Cross-chain onboarding | LI.FI Composer |
| Settlement currency / chain | USDC on Base mainnet |
| Agent front door | TenorFi agent (app / backend) |

## Security & soundness

- **No-default invariant** — per-period cap; the reserve pre-funds at least `cap × notional` and coverage can never overdraw its shipped Aqua balance (an underfunded period reverts rather than creating unbacked debt). The hedger posts no collateral — the premium is pulled from their wallet only when due.
- **Write-once funding index** — a period's realized funding is immutable once it settles real cashflow; only the CRE forwarder can write.
- **Deterministic core** — no AI in the settlement math; the agent operates but cannot override the brink (a human checkpoint).
- **Custom errors + explicit leg convention** — `net = realized − fixed` is fixed and unit-tested.

## Team

TenorFi — ETHGlobal New York 2026.

## License

MIT
