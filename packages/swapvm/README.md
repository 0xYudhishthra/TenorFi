# @keel/swapvm — custom SwapVM opcode (the Aqua app)

Keel's **1inch Aqua App** for the *Build an Aqua App* bounty (SwapVM scored higher). It adds one
custom instruction, **`_fundingSettle`**, that turns a swap into a funding-rate settlement.

## What it does
`_fundingSettle(Context ctx, bytes args)` computes the per-period net and writes it to the swap's
output register:

```
period   = block.timestamp / PERIOD_SECONDS          // derived on-chain; program stays fixed
R        = FundingIndex.getFundingIndex(period)       // AFR, per-period, signed 1e18 (from CRE)
net      = clamp(R − F, ±cap) × N / 1e18              // F = FFR (fixed), N = notional (USDC 1e6)
ctx.swap.amountOut = net                              // router delivers net: maker(payer) → taker(receiver)
```

Direction is chosen by the keeper when executing: when `R > F` the **LP is maker (pays)** and the
hedger is taker (receives); when `R < F` the sides flip. Same canonical math as `KeelSwap`
(`net = realized − fixed`), expressed idiomatically in SwapVM.

## Layout
- `contracts/FundingSettle.sol` — the instruction + `FundingSettleArgsBuilder` + `IFundingIndex`.
- `contracts/KeelSwapVMRouter.sol` — deployable router: `Simulator, SwapVM, AquaOpcodes, FundingSettle`;
  overrides `_opcodes()` to **append** `_fundingSettle` (preserves indices), `_instructions() => _opcodes()`.
- `contracts/KeelFundingProgram.sol` — builds the `[_fundingSettle]` program / `ISwapVM.Order`.
- `test/funding-settle.test.ts` — deploy Aqua + router + USDC + FundingIndex → ship → settle → assert transfer.

## Why this is the bounty artifact
- Custom SwapVM instruction (not just an app) → "scored higher".
- A funding-rate swap is a novel "sophisticated DeFi position" (a derivative), not another AMM.
- Collateral stays live via Aqua virtual balances.

## Build / test
```bash
cd packages/swapvm
yarn            # pulls @1inch/swap-vm 0.0.4 + @1inch/aqua + hardhat
yarn build      # hardhat compile
yarn test       # local; forks OK for the bounty demo
```
> NOTE: contracts are written against the verified `@1inch/swap-vm` / `@1inch/aqua` API but have
> NOT yet been compiled in CI here — run `yarn build` to verify and iterate. `KeelSwap`
> (plain Solidity, 25 tests) + `KeelFundingApp` (Aqua pull-based) remain the same-math fallbacks.
