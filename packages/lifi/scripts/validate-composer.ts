// Compile the real LI.FI Composer flows for a hedge and print the resulting
// transactions. This is the moment we learn whether LIFI_API_KEY has Composer
// (/compose) access — a 401/403 here means the key isn't enabled yet.
//
//   LIFI_API_KEY=... pnpm --filter @keel/lifi validate:composer
//
// Env: LIFI_API_KEY (required), SIGNER, COUNTERPARTY, KEEL_COLLATERAL (6-dec),
//      PERP_COLLATERAL (6-dec), FIXED_RATE (wad), CAP (wad), NOTIONAL (6-dec),
//      BASE_RPC_URL (for the buildProgram eth_call). Nothing is signed or sent.
import { isComposeError, type ComposeCompileResult } from "@lifi/composer-sdk";
import { buildKeelOpenFlow } from "../src/open.js";
import { buildPerpDepositFlow } from "../src/deposit.js";
import { createKeelComposeSdk } from "../src/client.js";

if (!process.env.LIFI_API_KEY) {
  console.warn("⚠️  LIFI_API_KEY is not set — the compile will likely 401/403.");
}

const signer = (process.env.SIGNER ?? "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045") as `0x${string}`;
const counterparty = (process.env.COUNTERPARTY ?? "0x000000000000000000000000000000000000dEaD") as `0x${string}`;
const keelCollateral = BigInt(process.env.KEEL_COLLATERAL ?? "10000000"); // 10 USDC
const perpCollateral = BigInt(process.env.PERP_COLLATERAL ?? "10000000"); // 10 USDC
const fixedRate = BigInt(process.env.FIXED_RATE ?? "25000000000000000"); // 2.5% wad
const cap = BigInt(process.env.CAP ?? "40000000000000000"); // 4% wad
const notional = BigInt(process.env.NOTIONAL ?? "1000000000"); // 1,000 USDC

const sdk = createKeelComposeSdk();

function report(label: string, result: ComposeCompileResult): void {
  console.log(`\n=== ${label} ===`);
  console.log(`status:    ${result.status}`);
  console.log(`userProxy: ${result.userProxy}`);
  if (result.status === "partial") {
    console.log(`revert:    ${result.error.message}`);
  }
  const req = result.transactionRequest;
  console.log(`tx.to:     ${req.to}`);
  console.log(`tx.value:  ${req.value}`);
  console.log(`tx.gas:    ${req.gasLimit ?? "(n/a — partial)"}`);
  console.log(`tx.data:   ${req.data.slice(0, 66)}… (${(req.data.length - 2) / 2} bytes)`);
  if (result.approvals?.length) {
    for (const a of result.approvals) {
      console.log(`approval:  ${a.token} -> ${a.spender} (${a.amount})`);
    }
  }
}

try {
  console.log(`signer ${signer} | keel ${keelCollateral} USDC | perp ${perpCollateral} USDC`);

  const keel = await buildKeelOpenFlow({
    signer,
    collateral: keelCollateral,
    counterparty,
    fixedRate,
    cap,
    notional,
    simulationPolicy: "allow-revert",
    sdk,
  });
  report("Keel leg (open swap on Base)", keel);

  const perp = await buildPerpDepositFlow({
    signer,
    amount: perpCollateral,
    simulationPolicy: "allow-revert",
    sdk,
  });
  report("Perp leg (bridge margin toward Hyperliquid)", perp);

  console.log("\n✅ Composer compiled both legs — the API key has /compose access.");
} catch (err) {
  if (isComposeError(err)) {
    console.error(`\n❌ ComposeError [${err.code}]${err.status ? ` (HTTP ${err.status})` : ""}: ${err.message}`);
    if (err.code === "UNAUTHENTICATED" || err.code === "FORBIDDEN") {
      console.error("   The LIFI_API_KEY does not have Composer (/compose) access yet.");
    }
  } else {
    console.error("\n❌ Unexpected error:", err);
  }
  process.exitCode = 1;
}
