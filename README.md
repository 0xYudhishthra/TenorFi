# Keel

> On-chain fixed-funding-rate swaps — built natively on 1inch Aqua, with collateral that never goes idle. Swap your *variable* perp funding for a *fixed* one, in one click.

- **Design doc** (source of truth): [`docs/design-doc.md`](docs/design-doc.md)
- **Bounty integrations** (1inch · Chainlink · LI.FI — diagrams + code): [`docs/bounty-integrations.md`](docs/bounty-integrations.md)
- **Security review** (Slither triage + on-chain checks): [`docs/security-review.md`](docs/security-review.md)
- **Settlement core**: [`packages/contracts`](packages/contracts) · **Aqua opcode**: [`packages/contracts/src/swapvm`](packages/contracts/src/swapvm)

---

## The problem

Perpetual-futures *funding* is the floating fee traders pay or earn every hour. It swings violently and nobody can lock it in — the variable cost that gutted Ethena (~$16.6B → ~$5.6B as its funding yield collapsed). TradFi solved this 40 years ago with the interest-rate swap (~$469T notional). Crypto built $60T+/yr of this risk; the safety net is still nascent.

## The solution

Keel is a funding-rate swap: **variable → fixed**. It never touches your Hyperliquid position — it settles against a *public number* (the funding rate, read by Chainlink CRE), like rain insurance pays on rainfall without controlling the weather.

- **Hedger (the customer / taker)** — a leveraged perp long. Pays fixed, receives floating → their variable funding is cancelled, leaving a flat locked rate. Takes our offer in one click.
- **Insurance reserve (us / maker)** — quotes a consistent fixed rate and stands as the counterparty, so a hedger locks instantly. Receives fixed, pays floating; earns the premium when funding stays calm, pays out (bounded per period) when it spikes.
- **The protocol stays neutral** — the contract only custodies and settles; the reserve provides the liquidity, exactly as an exchange is neutral while market-makers quote. *(Speculators that take the reserve's side are phase 2.)*

## How the swap works

Each period, the two legs exchange the fixed-vs-realized-floating difference from pre-locked collateral:

```
net = clamp(realized − fixed, ±cap) × notional       (credit to the hedger)
  realized > fixed  → hedger receives, reserve pays   (funding spiked — the payout that hedges the perp)
  realized < fixed  → hedger pays, reserve receives   (the premium for certainty)
```

**No default, by design:** funding is capped per period, and each side pre-locks at least one period's worst case (`cap × notional`). The most anyone can owe in a period is already paid up front; if a side is drained, only that side closes and the counterparty is paid in full.

## The brink decision

When a side's collateral can no longer cover one more worst-case period (`remaining < cap × notional`), Keel does not close blindly. The MCP agent prepares the choice — **close · re-match · continue (top up)** — and the user confirms it. *Agent proposes, user confirms:* the decision that moves money at the brink is made by a person.

## Integrations

| Component | What it does | Where |
|-----------|--------------|-------|
| **1inch Aqua / SwapVM** | Custom `_fundingSettle` instruction settles a period as `amountOut = net`; collateral stays live via virtual balances | `packages/contracts/src/swapvm` |
| **Chainlink CRE** | Funding-rate oracle: reads Hyperliquid BTC funding → DON consensus → on-chain `FundingIndex` | `packages/cre/keel-funding` · [`docs/bounty-integrations.md`](docs/bounty-integrations.md) |
| **LI.FI Composer** | Cross-chain collateral onboarding: fund + open the hedge with USDC from any chain | (integration lead) |
| **Settlement** | `_fundingSettle` SwapVM opcode over Aqua (no custodial contract — collateral stays live) + `FundingIndex` (write-once latch) | `packages/contracts/src` |

## Architecture

```mermaid
flowchart TB
    HEDGER["Hedger / taker"] -->|takes our rate| KEEL
    RESERVE["Insurance reserve / maker — quotes the fixed rate"] --> KEEL
    CRE["Chainlink CRE<br/>Hyperliquid funding → DON → KeystoneForwarder → KeelFundingReceiver.onReport"] -->|funding index| KEEL
    LIFI["LI.FI Composer<br/>USDC collateral, cross-chain"] --> KEEL
    KEEL["KEEL swap — 1inch Aqua / SwapVM (Base mainnet)<br/>custom _fundingSettle opcode · collateral stays live via Aqua virtual balances"]
    KEEL -->|settle / payout USDC| OUT["Hedger ↔ reserve via Aqua virtual balances"]
    KEEL -.->|collateral-low| BRINK["User confirms via MCP<br/>close / re-match / continue"]
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
| Keel MCP (agent front door) | Planned (M7) | `packages/mcp` |
| Web app (lock UI + Ethena replay) | Planned (M5) | `apps/web` |
| Base mainnet deployment (funding stack) | **Live** — see below | `packages/contracts/deployments.json` |

## Live deployment (Base mainnet, chain id 8453)

The Chainlink CRE funding stack is deployed and the end-to-end write is verified on-chain: the CRE workflow read real Hyperliquid BTC funding, reached consensus, and wrote it through the forwarder into `FundingIndex`.

| Contract | Address |
|----------|---------|
| `KeelFundingReceiver` (CRE `onReport` consumer) | [`0x7b7Ca2269f865C3448015173D433CcD7782aF582`](https://basescan.org/address/0x7b7Ca2269f865C3448015173D433CcD7782aF582) |
| `FundingIndex` (write-once funding latch) | [`0x545f162204A92CEbeb12AA0A4AaDF777d6905005`](https://basescan.org/address/0x545f162204A92CEbeb12AA0A4AaDF777d6905005) |
| Settlement token | **canonical Base USDC** [`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) — real USDC *(an early `MockUSDC 0x3A51…c6e8` is superseded/unused; CRE never used a token)* |
| Base `MockKeystoneForwarder` (rotatable; sim `--broadcast`) | `0x5e342a8438b4f5d39e72875fcee6f76b39cce548` |

Verified CRE write — tx [`0xd1b1e41b545a273e29f36a5f40f1238b0f32a3464bf7bc0698dcba78ff7e87f2`](https://basescan.org/tx/0xd1b1e41b545a273e29f36a5f40f1238b0f32a3464bf7bc0698dcba78ff7e87f2): `FundingIndex.getFundingIndex(494834)` returns `(12500000000000, true)` — Hyperliquid BTC funding `0.0000125` scaled to 1e18. Deployed via `script/DeployFunding.s.sol` (the CRE write path only; the full Aqua/SwapVM stack uses `script/Deploy.s.sol`).

## Repository layout

```
keel/
├── docs/                 # design doc (source of truth), bounty + CRE notes, hackathon roadmap
├── packages/
│   ├── contracts/        # Foundry (single env) — funding latch + CRE receiver (src/) + SwapVM settlement opcode (src/swapvm/) + deploy (script/)
│   ├── cre/              # Chainlink CRE workflow (TypeScript/bun): Hyperliquid funding → DON → on-chain index
│   ├── keeper/           # per-period settle() trigger
│   └── mcp/              # Keel MCP: read funding + operate the swap; brink → user confirm
└── apps/
    └── web/              # lock UI + the Ethena replay demo
```

## Quickstart

Everything is one Foundry package:

```bash
cd packages/contracts
pnpm install          # @1inch/swap-vm + @1inch/aqua (needed to build the SwapVM opcode)
forge test            # 45 tests
# integration vs the real deployed Aqua + USDC on a Base mainnet fork (+2 tests):
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
| Agent front door | Keel MCP |

## Security & soundness

- **No-default invariant** — per-period cap + pre-locked `cap × notional` per side; settlement only *moves* collateral between parties (conserved), so a credited party is always fully backed.
- **Write-once funding index** — a period's realized funding is immutable once it settles real cashflow; only the CRE forwarder can write.
- **Deterministic core** — no AI in the settlement math; the agent operates but cannot override the brink (a human checkpoint).
- **Custom errors + explicit leg convention** — `net = realized − fixed` is fixed and unit-tested.

## Team

Keel — ETHGlobal New York 2026.

## License

MIT
