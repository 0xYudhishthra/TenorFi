# How to Test TenorFi End-to-End

> What's deployed, what you run, and how to exercise the whole flow on Base mainnet.
> Keep amounts small — real funds. Throwaway keys only.

## What's already live

| Piece | Where | Check |
|---|---|---|
| **keel-api** (orchestrator) | `https://keel-api-production-9a1f.up.railway.app` | `GET /health` → `200` |
| **web** (tenor-web) | `https://tenorfi.up.railway.app` | loads; Connect Wallet works |
| **Chainlink CRE** | Base mainnet (Axel) | writes hourly funding → FundingIndex |
| **contracts** | Base mainnet | Basescan-verified |

You run **one thing locally**: the **execution-node** (it signs Hyperliquid perp orders + margin top-ups with the HL agent key — kept off the API by design). Non-US machine.

## 0. One-time setup

**Fund the wallets (Base, canonical USDC `0x8335…2913`):**
| Wallet | Address | USDC | ETH (gas) |
|---|---|---|---|
| Reserve/keeper | `0xD6b98bf8aa9769cF5469E1236A7024a0AaD5dCc3` | ~10 | ~0.005 |
| Hedger/subscriber | `0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd` | ~15 (5 premium + 10 perp margin) | ~0.005 |

**Run the execution-node locally** (drains the API's perp/top-up intent queue):
```bash
cd /home/yudhishthra/keel
pnpm install                      # once (builds better-sqlite3)
pnpm --filter @keel/api exec-node # reads ../../.env (HL_AGENT_PRIVATE_KEY, HL_NETWORK=mainnet)
```

## 1. Smoke tests (no funds, ~1 min)

```bash
API=https://keel-api-production-9a1f.up.railway.app
curl -s $API/health                       # {"ok":true,...}
curl -s $API/funding/BTC                   # live Hyperliquid BTC funding (annualized)
# Composer ACTIVATE + classic deposit compile (LI.FI live):
curl -s -X POST $API/hedge/quote -H 'content-type: application/json' -d '{
  "fromAddress":"0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd",
  "fromChain":8453,
  "perpCollateralUsd":"10",
  "keelCollateralUsd":"10"
}' | head -c 800
```
- `deposit` (classic → HyperCore) and `open` (Composer activate → approve Aqua) should both return a `transactionRequest`. If `open` errors with a LI.FI 401/403, the `LIFI_API_KEY` env on keel-api is wrong; a proxy/compile error is the Composer flow to debug.

## 2. The full demo flow

1. **Reserve ships** the subscription order (the LP — one-time per subscriber). Either:
   - API: `POST /positions/:id/confirm-tx` (the Lock flow triggers `onchain.ship`), or
   - Script (see `docs/demo-runbook.md` §6): `Ship.s.sol` with `HEDGER=0x2357…Bbfd`.
2. **Hedger subscribes via the web** (`tenorfi.up.railway.app`): Connect Wallet (MetaMask) → Base → Create a position → confirm. This calls `/hedge` → **classic bridge** (USDC → HyperCore) + **Composer activate** (approve Aqua). Sign both.
3. **execution-node opens the BTC perp** (drains the `openPerp` intent) on Hyperliquid.
4. **CRE** writes BTC funding hourly → `FundingIndex` (verify: `docs/demo-runbook.md` §4).
5. **Settlement (hourly, automatic):** the API `settlement-scheduler` runs `Settle.s.sol` **signed by the hedger** (`SUBSCRIBER_PRIVATE_KEY`) → real USDC moves:
   - **R > F** → reserve covers → the payout **tops up the hedger's HL margin** (execution-node `topUpMargin`).
   - **R < F** → premium pulled from the hedger's wallet.
6. **UI reflects**: the explorer + fee table show live funding (HL-charged vs TenorFi-net vs your-real-cost, APR) and the settlement feed.

## 3. Manual on-chain proof (no UI, fastest)

Follow `docs/demo-runbook.md` — `Ship.s.sol` (reserve) then `Settle.s.sol` (hedger key) against live CRE funding. One hourly settlement proves the on-chain half.

## Troubleshooting

- **Connect Wallet doesn't open MetaMask** → ensure `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set on tenor-web (it is) and you've redeployed.
- **`/hedge/quote` open leg errors** → `LIFI_API_KEY` on keel-api, or a Composer compile/proxy issue.
- **Settle reverts `FundingNotSet`** → CRE hasn't written the current hour yet (runbook §4).
- **Settle reverts `UnauthorizedTaker`** → the settle must be signed by the hedger (`SUBSCRIBER_PRIVATE_KEY`), not the reserve — fixed in the API.
- **Perp never opens / margin never tops up** → the execution-node isn't running (§0).
- **Settlement says `simulated: true`** → `SETTLE_BROADCAST`/`KEEPER`/`SUBSCRIBER` keys or `BASE_RPC_URL` missing on keel-api.
