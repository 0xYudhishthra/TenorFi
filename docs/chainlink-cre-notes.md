# Chainlink CRE — Integration Notes (Axel)

> Consolidated CRE notes reflecting the **current** system (LP-primary RFQ · MCP two-leg ·
> AFR/FFR settlement · custom SwapVM `_fundingSettle` opcode · Ethereum Sepolia). Source of truth for
> the funding oracle. See design-doc §6 + §12 for the wider context.

## Role — the oracle that doesn't exist
CRE is the **funding-rate oracle**: it reads BTC funding from **Hyperliquid**, reaches DON
consensus, and writes it on-chain. Without it nothing settles. Because we read funding from
Hyperliquid *and* deploy on Ethereum Sepolia, **the oracle source and the settlement chain are the same venue.**

CRE flow: **cron trigger → HTTP fetch HL funding → DON consensus → KeystoneForwarder →
`FundingIndex.setFundingIndex(period, value)`**.

## What CRE writes (the contract interface — already shipped)
`FundingIndex.setFundingIndex(uint256 period, int256 value)`, `onlyForwarder`, write-once per period.

- **`value` = R = AFR** (Actual Funding Rate) — the realized funding for that period.
  - Type **`int256`, signed, scale `1e18`, PER-PERIOD** (not annualized).
  - **Annualized → per-period conversion happens OFF-CHAIN, in the CRE workflow** (LOCKED
    decision — design-doc §6). The contract NEVER sees an annualized rate.
- **`period` = `floor(unixSeconds / PERIOD_SECONDS)`**, `PERIOD_SECONDS = 120` for the demo.
  CRE writes keyed by this exact formula — everyone (contract, keeper, UI, MCP) uses it.
- Set the contract's `onlyForwarder` to the CRE **KeystoneForwarder** address.

## Who consumes the index (the new system — three consumers)
1. **`KeelSwap.settle(swapId, period)`** — plain-Solidity fallback (shipped, 25 tests). Reads
   `getFundingIndex(period)` → `net = clamp(R − F, ±cap) × N`.
2. **`_fundingSettle` SwapVM opcode** (the new Aqua app, `packages/swapvm`) — reads the latched
   index and sets `ctx.swap.amountOut = net`. Same math, idiomatic SwapVM.
3. **MCP `get_funding(market)`** — surfaces **AFR** to the agent. On **`AFR > FFR`** the MCP
   pays the hedger and **tops up their Hyperliquid margin**; on `AFR < FFR` the premium flows to
   the LP pool. (AFR/FFR = `realized`/`fixed`; `R > F` ⇒ hedger credited — matches the contract.)

## Hyperliquid funding source (verify exact schema on the day)
- Testnet info API: `POST https://api.hyperliquid-testnet.xyz/info`
  - Current funding: body `{"type":"metaAndAssetCtxs"}` → asset ctx includes `funding`.
  - History: body `{"type":"fundingHistory","coin":"BTC","startTime":<ms>}` → `[{coin, fundingRate, premium, time}]`.
- HL `fundingRate` is **hourly, fractional** (e.g. `"0.0000125"`). Convert to our per-period
  `1e18` signed value in the workflow (for the compressed demo, treat the hourly rate as the
  per-period rate, or scale by `Δt`/hour — document whichever you pick).

## Bounty fit — "Best workflow with CRE" ($6,000, up to 3×$2,000)
- Integrate a blockchain with an external API (Hyperliquid) — squarely in scope.
- **A successful CRE CLI simulation qualifies** — and they'll deploy it to the live CRE network
  for you during the event. Land **≥1 real on-chain `setFundingIndex` write** for the submission.
- ⚠️ Must make a **state change on-chain** (the `setFundingIndex` write). A frontend merely
  reading a feed does **not** count. Use the CRE SDK (Go or TS) + CRE CLI.

## Build steps (Axel)
1. **(recon)** Ethereum Sepolia RPC + check **KeystoneForwarder availability** on Ethereum Sepolia. Get
   the deployed `FundingIndex` address from the deploy step (`deployments.json`).
2. Write the CRE workflow: HTTP fetch HL BTC funding → DON consensus → convert annualized→per-period
   → `setFundingIndex(period, value)` via the forwarder.
3. **Simulate via CRE CLI** (qualifies for the bounty); capture the run.
4. Land one real on-chain write; hand the tx hash to Shaun for the submission.

## Fallback (don't let a flaky DON kill the demo)
If CRE isn't writing reliably by the **19:30 checkpoint** → switch the **live demo loop** to the
**EOA relayer** (backend posts the real API-derived per-period index to `setFundingIndex`), but
**keep the one real CRE write** for the Chainlink submission. Decision deadline: 19:30.

## Resources
- CRE docs: https://docs.chain.link/cre · templates: https://github.com/smartcontractkit/cre-templates
- Uses the `chainlink-cre-skill`.
