// Manual validation of the write path: open a small perp long, verify it, close it.
//
// Runs against testnet by default (HL_NETWORK unset) or mainnet (HL_NETWORK=mainnet).
// NOT part of the test suite — it opens and closes a REAL position. Run on demand:
//   pnpm --filter @keel/hyperliquid validate:write
//
// Env: HL_AGENT_PRIVATE_KEY, HL_MASTER_ADDRESS (required); HL_NETWORK (optional);
//      VALIDATE_MARKET (BTC), VALIDATE_NOTIONAL (12), VALIDATE_LEVERAGE (2).
import { closePosition, DEFAULT_NETWORK, getAccountState, openPerpLong } from "../src/index.js";

const master = process.env.HL_MASTER_ADDRESS as `0x${string}` | undefined;
if (!master) throw new Error("HL_MASTER_ADDRESS not set");

const market = process.env.VALIDATE_MARKET ?? "BTC";
const usdNotional = Number(process.env.VALIDATE_NOTIONAL ?? "12");
const leverage = Number(process.env.VALIDATE_LEVERAGE ?? "2");

console.log(`[${DEFAULT_NETWORK}] validate write: ${market} ~$${usdNotional} @ ${leverage}x`);

console.log("1) open long ...");
const open = await openPerpLong({ market, usdNotional, leverage });
console.log("   ", JSON.stringify(open).slice(0, 400));

console.log("2) verify position ...");
const state = await getAccountState(master);
const pos = state.assetPositions.find((p) => p.position.coin === market);
console.log("   ", pos ? JSON.stringify(pos.position) : "NO POSITION FOUND");

console.log("3) close ...");
const close = await closePosition({ market });
console.log("   ", JSON.stringify(close).slice(0, 400));

console.log("DONE");
