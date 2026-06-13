# Keel

**On-chain fixed-funding-rate swaps — built natively on 1inch Aqua, with collateral that never goes idle.**

Perpetual-futures *funding* is the floating fee traders pay or earn every hour. It swings violently and nobody can lock it in — the variable cost that gutted Ethena (~$16.6B → ~$5.6B as its funding yield collapsed). TradFi solved this 40 years ago with the interest-rate swap (~$469T notional). Keel rebuilds that for crypto funding: swap your **variable** funding for a **fixed** one, in one click.

- **Hedger** pays fixed / receives floating → locks a flat rate (buys certainty). The primary customer is the leveraged long: funding drains *margin*, and at `L×` leverage a funding spike that's a nuisance at 1× is a liquidation.
- **Keel LP (us)** is the rate-offerer and counterparty — receives fixed / pays floating, earning the premium when funding stays calm and paying out (bounded per period) when it spikes. The hedger **takes** our standing offer one-click, so liquidity is instant (no waiting for a counterparty). *Speculators are phase 2 — for now we are the counterparty.*
- **The protocol stays neutral** — the Keel contract only custodies + settles; the LP provides the liquidity (exactly as an exchange is neutral while market-makers quote). It never touches your Hyperliquid position; it settles against a *public number* (the funding rate, read by Chainlink CRE) — like rain insurance pays on rainfall without controlling the weather. Funding is capped per period and collateral is pre-locked to cover the max, so **the most anyone can owe is already paid → no default.**
- **The brink decision** — when a side's collateral runs low, Keel doesn't close blindly: the MCP agent prepares the close / re-match / continue choice and **the user confirms it**. The decision that matters is made by a person, not an algorithm.
- **Agent layer (MCP)** — a Keel MCP lets an agent read live funding and *operate* the swap (open / monitor / settle), but it can't *override* the brink: there, it prepares the decision and hands it to the user to confirm. **Agent proposes, user confirms.**

The settlement core is deterministic — no AI in the math, no hallucination risk where money moves — with a single deliberate human checkpoint at the brink. The swap deploys on **Ethereum Sepolia**; the funding rate is read from **Hyperliquid**.

> Honest framing: funding-rate swaps already exist (Rho, Strips, IPOR). Keel's edge is **execution** — an Aqua-native swap with **live, in-wallet collateral** (Aqua virtual balances keep capital productive while it backs the swap), a **custom SwapVM settlement opcode**, and pure matching. We do **not** claim "first."

## Monorepo layout

```
keel/
├── docs/              # design doc, build plan, validation research (thought process)
├── packages/
│   ├── contracts/     # Foundry — settlement core: KeelSwap + FundingIndex latch
│   ├── cre/           # Chainlink CRE workflow: Hyperliquid funding → on-chain index
│   ├── keeper/        # hourly settle() trigger
│   └── mcp/           # Keel MCP: read Hyperliquid + operate the swap; brink → user confirm
└── apps/
    └── web/           # the lock UI + the Ethena replay demo
```

## Bounty stack (all load-bearing)

- **1inch — Aqua App** · the funding-rate swap + `_fundingSettle` custom SwapVM opcode.
- **Chainlink — CRE** · the on-chain funding-rate oracle (Hyperliquid → DON → on-chain). Without it there's nothing to swap.
- **LI.FI — Composer** · cross-chain collateral onboarding: fund + open the hedge with USDC from any chain in one flow.
- *Deploy target:* **Ethereum Sepolia**; funding data source: **Hyperliquid** (read by CRE).

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
