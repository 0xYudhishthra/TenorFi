# TenorFi — Live Demo Runbook (Base mainnet)

> The copy-pasteable script for the on-chain **ship → settle** loop on Base mainnet, hourly.
> **Never commit a private key or `.env`.** Use a throwaway hackathon key with small balances.
> Real funds/gas — keep `NOTIONAL` small for the live run.

---

## 0. What this demonstrates

A real funding-rate subscription settling on Base mainnet:

1. **Chainlink CRE** writes Hyperliquid BTC funding **hourly** into `FundingIndex`.
2. The **reserve** ships one `_fundingSettle` order into 1inch Aqua (bound to the subscriber).
3. Each hour the **subscriber** settles the current period → real USDC moves:
   - `R > F` → the reserve **covers** the funding (subscriber is paid `amountOut`).
   - `R < F` → the **premium** is pulled from the subscriber's wallet (`amountIn`).

Everything is hourly: the order's `periodSeconds = 3600`, matching CRE and Hyperliquid's
funding interval. The opcode reads `FundingIndex[block.timestamp / 3600]`.

## Live addresses (Base mainnet, chain 8453)

| Contract | Address |
|---|---|
| TenorSwapVMRouter | `0xba93ebc0A6a24980703423C3CE729F15eEDA099B` |
| TenorFundingProgram | `0xd04Aa86aB1bd11834931b667f918B945f6556174` |
| PositionToken | `0x7c055823cfe08841a1b3F73e56C86183bc859132` |
| FundingIndex | `0x545f162204A92CEbeb12AA0A4AaDF777d6905005` |
| KeelFundingReceiver | `0x7b7Ca2269f865C3448015173D433CcD7782aF582` |
| Aqua | `0x499943E74FB0cE105688beeE8Ef2ABec5D936d31` |
| USDC (canonical Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

*(Source: `packages/contracts/deployments.json`. The Ship/Settle scripts hardcode these.)*

---

## 1. Cast of characters

| Party | Holds | Runs |
|---|---|---|
| **Reserve** (us / maker) | reserve key, USDC for coverage | `Ship.s.sol` (once per subscriber) |
| **Subscriber** (hedger / taker) | subscriber key, USDC for premium | `Settle.s.sol` (each hour); one-time USDC approve to Aqua |
| **CRE / Axel** | the keel-funding workflow | writes funding hourly (standing) |

The order is **bound to the subscriber** (`taker = subscriber`) — only the subscriber's key can
settle it (`UnauthorizedTaker` otherwise). For the demo, the agent settles on the subscriber's behalf
using the subscriber key.

## 2. Prerequisites (env — put in your shell, NOT in git)

```bash
export BASE_RPC_URL="https://mainnet.base.org"     # or your own RPC
# Throwaway keys — small balances only. NEVER commit these.
export RESERVE_KEY=0x...        # reserve wallet (ships + funds coverage)
export SUBSCRIBER_KEY=0x...     # subscriber wallet (settles + pays premium)
export RESERVE_ADDR=0x...       # address(RESERVE_KEY)
export SUBSCRIBER_ADDR=0x...    # address(SUBSCRIBER_KEY)

# Economic params (must MATCH between Ship and Settle, or the rebuilt orderHash won't
# find the shipped balance). Defaults shown; override as needed.
export NOTIONAL=100000000       # 100 USDC (1e6)
export COLLATERAL=10000000      # 10 USDC reserve ship floor (>= cap*notional)
export FIXED_RATE=8333333333333 # 7.3% APR as a per-HOUR 1e18 rate
export CAP=40000000000000000    # 4% per-period clamp (4e16)
```

## 3. Validate the scripts compile (no broadcast)

```bash
cd packages/contracts
forge build                      # Ship/Settle compile
forge test                       # 39 passing (43 total, 4 fork tests skipped without RPC)
```

## 4. Confirm CRE wrote the current hour's funding

The settle reverts `FundingNotSet` if the current hourly slot is empty. Check it:

```bash
PERIOD=$(( $(date +%s) / 3600 ))
cast call 0x545f162204A92CEbeb12AA0A4AaDF777d6905005 \
  "isSet(uint256)(bool)" $PERIOD --rpc-url $BASE_RPC_URL
# expect: true   (if false → the CRE workflow hasn't written this hour yet; wait or have Axel run it)
```

> Funding write path is **Chainlink CRE → KeystoneForwarder → KeelFundingReceiver.onReport → FundingIndex**.
> If the DON is unavailable, the receiver also accepts an owner-set **EOA relayer** as a liveness fallback
> (`setRelayer` then `onReport` with the same `abi.encode(uint256 period, int256 value)`), but the demo's
> default path is the live CRE workflow.

## 5. Subscriber: one-time USDC approve to Aqua

So Aqua can pull the premium on `R < F` periods:

```bash
cast send 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  "approve(address,uint256)" 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31 \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --private-key $SUBSCRIBER_KEY --rpc-url $BASE_RPC_URL
```

## 6. Reserve: ship the order (once, for this subscriber)

```bash
cd packages/contracts
PRIVATE_KEY=$RESERVE_KEY HEDGER=$SUBSCRIBER_ADDR \
NOTIONAL=$NOTIONAL COLLATERAL=$COLLATERAL FIXED_RATE=$FIXED_RATE CAP=$CAP \
forge script script/Ship.s.sol:Ship --rpc-url $BASE_RPC_URL --broadcast
```

Writes `order-params.json`. Expect the reserve's USDC collateral shipped into Aqua + a 1e18 position marker.

## 7. Subscriber: settle the current hour

Run once per hour (the agent/keeper can cron this). Params MUST match the shipped order.

```bash
cd packages/contracts
PRIVATE_KEY=$SUBSCRIBER_KEY MAKER=$RESERVE_ADDR \
NOTIONAL=$NOTIONAL FIXED_RATE=$FIXED_RATE CAP=$CAP \
forge script script/Settle.s.sol:Settle --rpc-url $BASE_RPC_URL --broadcast
```

What to expect in the logs:
- `period:` the hourly bucket (`block.timestamp / 3600`)
- `realized R (1e18):` the funding CRE latched
- `R > F` → `coverage paid to subscriber (USDC 1e6):` — the reserve covered the gap; **the agent then
  tops up the subscriber's Hyperliquid margin with this coverage** (see §8).
- `R < F` → `premium pulled from subscriber wallet (USDC 1e6):` — the cost of certainty.
- `R == F` → "nothing to settle this period".

A period can only be settled **once** (double-settle guard) and **current-period only** (a missed hour
can't be back-settled — range settlement is roadmap).

## 8. (Coverage only) Top up the subscriber's Hyperliquid margin

When §7 paid the subscriber (`R > F`), route that coverage into their HL perp margin so the hedge stays
funded. The keel-api does this automatically (settlement → `topUpMargin` intent → execution-node →
`updateIsolatedMargin`). Manual equivalent lives in `@keel/hyperliquid` (`topUpMargin`). This keeps the
subscriber's **net** funding cost pinned at the fixed rate while strengthening their position.

## 9. The API-driven path (optional, fully wired)

Instead of running §6–§8 by hand, run the **keel-api** which orchestrates the same calldata: the
settlement-scheduler settles each hour and, on coverage, enqueues the margin top-up; the hedge flow
ships on subscribe. It is **dry-run by default** — set `KEEPER_PRIVATE_KEY` + `BASE_RPC_URL` +
`SETTLE_BROADCAST=true` to broadcast for real. See `packages/api/README` (or `src/config.ts`) for the
exact env. The web UI reads live state from this API.

---

## Safety checklist

- [ ] Keys are throwaway, small balances, **never committed** (no `.env` in git).
- [ ] `NOTIONAL` small for the live run (real USDC/gas).
- [ ] CRE slot for the current hour is `isSet == true` before settling (§4).
- [ ] Ship and Settle use **identical** `NOTIONAL`/`FIXED_RATE`/`CAP` (or the orderHash won't match).
- [ ] Subscriber approved USDC to Aqua before the first `R < F` settle (§5).
