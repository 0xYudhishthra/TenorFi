# Keel

> On-chain fixed-funding-rate swaps — built natively on 1inch Aqua, with collateral that never goes idle. Swap your *variable* perp funding for a *fixed* one, in one click.

- **Design doc** (source of truth): [`docs/design-doc.md`](docs/design-doc.md)
- **Build plan**: [`docs/build-plan.md`](docs/build-plan.md)
- **Bounty integrations**: [`docs/bounty-integrations.md`](docs/bounty-integrations.md)
- **Chainlink CRE notes**: [`docs/chainlink-cre-notes.md`](docs/chainlink-cre-notes.md)
- **Settlement core**: [`packages/contracts`](packages/contracts) · **Aqua opcode**: [`packages/swapvm`](packages/swapvm)

---

## The problem

Perpetual-futures *funding* is the floating fee traders pay or earn every hour. It swings violently and nobody can lock it in — the variable cost that gutted Ethena (~$16.6B → ~$5.6B as its funding yield collapsed). TradFi solved this 40 years ago with the interest-rate swap (~$469T notional). Crypto built $60T+/yr of this risk; the safety net is still nascent.

## The solution

Keel is a funding-rate swap: **variable → fixed**. It never touches your Hyperliquid position — it settles against a *public number* (the funding rate, read by Chainlink CRE), like rain insurance pays on rainfall without controlling the weather.

- **Hedger (the customer / taker)** — a leveraged perp long. Pays fixed, receives floating → their variable funding is cancelled, leaving a flat locked rate. Takes our offer in one click.
- **Keel LP (us / maker)** — quotes a consistent fixed rate and stands as the counterparty, so a hedger locks instantly. Receives fixed, pays floating; earns the premium when funding stays calm, pays out (bounded per period) when it spikes.
- **The protocol stays neutral** — the contract only custodies and settles; the LP provides the liquidity, exactly as an exchange is neutral while market-makers quote. *(Speculators that take the LP's side are phase 2.)*

## How the swap works

Each period, the two legs exchange the fixed-vs-realized-floating difference from pre-locked collateral:

```
net = clamp(realized − fixed, ±cap) × notional       (credit to the hedger)
  realized > fixed  → hedger receives, LP pays        (funding spiked — the payout that hedges the perp)
  realized < fixed  → hedger pays, LP receives        (the premium for certainty)
```

**No default, by design:** funding is capped per period, and each side pre-locks at least one period's worst case (`cap × notional`). The most anyone can owe in a period is already paid up front; if a side is drained, only that side closes and the counterparty is paid in full.

## The brink decision

When a side's collateral can no longer cover one more worst-case period (`remaining < cap × notional`), Keel does not close blindly. The MCP agent prepares the choice — **close · re-match · continue (top up)** — and the user confirms it. *Agent proposes, user confirms:* the decision that moves money at the brink is made by a person.

## Integrations

| Component | What it does | Where |
|-----------|--------------|-------|
| **1inch Aqua / SwapVM** | Custom `_fundingSettle` instruction settles a period as `amountOut = net`; collateral stays live via virtual balances | `packages/swapvm/contracts` |
| **Chainlink CRE** | Funding-rate oracle: reads Hyperliquid BTC funding → DON consensus → on-chain `FundingIndex` | `packages/cre` · [`docs/chainlink-cre-notes.md`](docs/chainlink-cre-notes.md) |
| **LI.FI Composer** | Cross-chain collateral onboarding: fund + open the hedge with USDC from any chain | (integration lead) |
| **Settlement core** | `KeelSwap` (matched swap, settlement, no-default) + `FundingIndex` (write-once latch) | `packages/contracts/src` |

## Architecture

```
 HEDGER (taker) ── takes our rate ──┐          ┌── KEEL LP (maker) — quotes the fixed rate
                                    ▼          ▼
        KEEL — funding-rate swap (1inch Aqua / SwapVM, Ethereum Sepolia)
        • custom _fundingSettle opcode nets fixed-vs-floating each period
        • collateral stays live in-wallet via Aqua virtual balances
                    ▲ funding index                  │ collateral-low → human checkpoint
        ┌───────────┴───────────┐                    ▼
   CHAINLINK CRE                              USER CONFIRMS (close / re-match / continue, via MCP)
   Hyperliquid funding → DON → on-chain                settle / payout in USDC
   LI.FI Composer: USDC collateral cross-chain → into the swap
```

## The settlement loop

```
Hyperliquid BTC funding (hourly, the public number)
        ↓   Chainlink CRE: HTTP fetch → DON consensus → KeystoneForwarder
FundingIndex.setFundingIndex(period, R)            on Ethereum Sepolia
        ↓   keeper fires settle() each period
_fundingSettle opcode (or KeelSwap): net = clamp(R − F, ±cap) × N
        ↓
USDC moves hedger ↔ LP via Aqua virtual balances   (collateral never locked)
```

## Status

| Component | Status | Where |
|-----------|--------|-------|
| Settlement core (`KeelSwap` + `FundingIndex`) | **Built · 25 tests** | `packages/contracts` |
| Custom SwapVM opcode (`_fundingSettle` + router + program) | **Built · 5 tests** (incl. e2e moving real USDC via Aqua) | `packages/swapvm` |
| Chainlink CRE funding oracle | Planned (M2) | `packages/cre` |
| LI.FI cross-chain onboarding | Planned | integration lead |
| Keel MCP (agent front door) | Planned (M7) | `packages/mcp` |
| Web app (lock UI + Ethena replay) | Planned (M5) | `apps/web` |
| Ethereum Sepolia deployment | Pending | — |

## Repository layout

```
keel/
├── docs/                 # design doc (source of truth), build plan, bounty + CRE notes
├── packages/
│   ├── contracts/        # Foundry — KeelSwap + FundingIndex (settlement core)
│   ├── swapvm/           # Hardhat — custom _fundingSettle SwapVM opcode (the Aqua app)
│   ├── cre/              # Chainlink CRE workflow: Hyperliquid funding → on-chain index
│   ├── keeper/           # per-period settle() trigger
│   └── mcp/              # Keel MCP: read funding + operate the swap; brink → user confirm
└── apps/
    └── web/              # lock UI + the Ethena replay demo
```

## Quickstart

Settlement core (Foundry):

```bash
cd packages/contracts
forge test            # 25 tests
```

Aqua opcode (Hardhat):

```bash
cd packages/swapvm
npm install           # pulls @1inch/swap-vm + @1inch/aqua
npx hardhat test      # 5 tests, incl. e2e: the opcode moves USDC through Aqua
```

## Tech stack

| Layer | Choice |
|-------|--------|
| Settlement contracts | Solidity 0.8.30, Foundry |
| Aqua app | 1inch SwapVM custom instruction (Hardhat) |
| Funding oracle | Chainlink CRE (reads Hyperliquid funding) |
| Cross-chain onboarding | LI.FI Composer |
| Settlement currency / chain | USDC on Ethereum Sepolia |
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
