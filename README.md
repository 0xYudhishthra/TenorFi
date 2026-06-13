# Keel

**On-chain fixed-funding-rate swaps — built natively on 1inch Aqua, with collateral that never goes idle.**

Perpetual-futures *funding* is the floating fee traders pay or earn every hour. It swings violently and nobody can lock it in — the variable cost that gutted Ethena (~$16.6B → ~$5.6B as its funding yield collapsed). TradFi solved this 40 years ago with the interest-rate swap (~$469T notional). Keel rebuilds that for crypto funding: swap your **variable** funding for a **fixed** one, in one click.

- **Hedger** pays fixed / receives floating → locks a flat rate (buys certainty).
- **Speculator** receives floating / pays fixed → bets funding stays high (buys upside).
- **Keel matches + custodies** both sides — no house position. Settles hourly against a Chainlink funding index; funding is capped per hour and collateral is pre-locked to cover the max, so **the most anyone can owe is already paid → no default.**

No AI, no agent — a deterministic financial primitive.

> Honest framing: funding-rate swaps already exist (Rho, Strips, IPOR). Keel's edge is **execution** — an Aqua-native swap with **live, in-wallet collateral** (Aqua virtual balances keep capital productive while it backs the swap), a **custom SwapVM settlement opcode**, and pure matching. We do **not** claim "first."

## Monorepo layout

```
keel/
├── docs/              # design doc, build plan, validation research (thought process)
├── packages/
│   ├── contracts/     # Foundry — settlement core: KeelSwap + FundingIndex latch
│   ├── cre/           # Chainlink CRE workflow: Hyperliquid funding → on-chain index
│   └── keeper/        # hourly settle() trigger
└── apps/
    └── web/           # the lock UI + the Ethena replay demo
```

## Bounty stack (all load-bearing)

- **1inch — Aqua App** · the funding-rate swap + `_fundingSettle` custom SwapVM opcode.
- **Chainlink — CRE** · the on-chain funding-rate oracle (Hyperliquid → DON → on-chain). Without it there's nothing to swap.
- **Arc** · USDC collateral + hourly settlement; rates/capital-markets is Arc's domain.

## Status

Early build (ETHGlobal New York 2026). Start with `docs/build-plan.md`.

## Quickstart

```bash
pnpm install
pnpm contracts:build
pnpm contracts:test
```

Copy `.env.example` → `.env` and fill in your own values. **Never commit `.env` or any private key.**

## License

MIT
