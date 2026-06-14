// Generate a self-contained deposit.html so a friend can sign the HyperCore deposit
// in MetaMask (their key never leaves the wallet — we only propose the tx), then
// monitor the bridge. MAINNET. Quotes need no funds; signing/sending does.
//
//   Generate: DEPOSIT_FROM_ADDRESS=0x.. pnpm --filter @keel/lifi validate:deposit
//   Monitor:  MONITOR_TX=0x.. pnpm --filter @keel/lifi validate:deposit
//
// Env: DEPOSIT_FROM_ADDRESS (friend's address), DEPOSIT_FROM_CHAIN (8453 Base),
//      DEPOSIT_AMOUNT (5000000 = 5 USDC), MONITOR_TX (poll an existing tx).
import { writeFileSync } from "node:fs";
import { encodeFunctionData } from "viem";
import { getStatus } from "@lifi/sdk";
import { buildHyperCoreDeposit, CHAINS, createLifiClient } from "../src/index.js";

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const fromChain = Number(process.env.DEPOSIT_FROM_CHAIN ?? String(CHAINS.base));
const lifi = createLifiClient();
const monitorTx = process.env.MONITOR_TX as `0x${string}` | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (monitorTx) {
  console.log(`monitoring bridge for ${monitorTx} (fromChain=${fromChain} -> HyperCore)...`);
  for (let i = 0; i < 120; i++) {
    const res = await getStatus(lifi, {
      txHash: monitorTx,
      fromChain,
      toChain: CHAINS.hyperliquid,
    });
    console.log(`  status=${res.status}${res.substatus ? ` (${res.substatus})` : ""}`);
    if (res.status === "DONE") {
      console.log("✅ funds landed on HyperCore");
      break;
    }
    if (res.status === "FAILED" || res.status === "INVALID") {
      console.log(`❌ ${res.status}`);
      break;
    }
    await sleep(5000);
  }
} else {
  const fromAddress = process.env.DEPOSIT_FROM_ADDRESS as `0x${string}` | undefined;
  if (!fromAddress) throw new Error("set DEPOSIT_FROM_ADDRESS (the friend's mainnet address)");
  const amount = process.env.DEPOSIT_AMOUNT ?? "5000000"; // 5 USDC

  const step = await buildHyperCoreDeposit({ fromChain, amount, fromAddress });
  const req = step.transactionRequest;
  if (!req?.to) throw new Error("quote returned no transactionRequest");
  const valueHex = req.value ? `0x${BigInt(req.value).toString(16)}` : "0x0";

  // The router pulls USDC via transferFrom, so it needs an allowance first.
  const fromToken = step.action.fromToken?.address as `0x${string}` | undefined;
  const spender = (step.estimate.approvalAddress ?? req.to) as `0x${string}`;
  if (!fromToken) throw new Error("quote has no fromToken address");
  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender, BigInt(step.estimate.fromAmount)],
  });

  const html = renderHtml({
    fromAddress,
    chainIdHex: `0x${Number(req.chainId ?? fromChain).toString(16)}`,
    chainId: Number(req.chainId ?? fromChain),
    approveTo: fromToken,
    approveData,
    to: req.to,
    data: req.data ?? "0x",
    valueHex,
    tool: step.tool,
    amountUsdc: (Number(amount) / 1e6).toString(),
  });
  const out = new URL("../deposit.html", import.meta.url);
  writeFileSync(out, html);
  console.log(`wrote ${out.pathname}`);
  console.log(`  tool=${step.tool} chainId=${req.chainId} to=${req.to} value=${valueHex}`);
  console.log(`  -> 5 USDC into HyperCore; open deposit.html, connect MetaMask on Base, Send.`);
}

function renderHtml(tx: {
  fromAddress: string;
  chainIdHex: string;
  chainId: number;
  approveTo: string;
  approveData: string;
  to: string;
  data: string;
  valueHex: string;
  tool: string;
  amountUsdc: string;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Keel — HyperCore deposit</title>
<style>body{font:14px system-ui;max-width:640px;margin:40px auto;padding:0 16px}
button{font:inherit;padding:8px 14px;margin:4px 0;cursor:pointer}pre{background:#f4f4f4;padding:10px;overflow:auto;white-space:pre-wrap}</style>
</head><body>
<h2>Keel — deposit ${tx.amountUsdc} USDC into HyperCore</h2>
<p>Sign with <code>${tx.fromAddress}</code> on <b>Base</b> (chainId ${tx.chainId}). Route: <code>${tx.tool}</code>.</p>
<button id="connect">1) Connect MetaMask</button>
<button id="approve" disabled>2) Approve ${tx.amountUsdc} USDC</button>
<button id="send" disabled>3) Send deposit</button>
<pre id="out">not connected</pre>
<script>
const APPROVE = ${JSON.stringify({ to: tx.approveTo, data: tx.approveData })};
const TX = ${JSON.stringify({ to: tx.to, data: tx.data, value: tx.valueHex })};
const CHAIN_HEX = ${JSON.stringify(tx.chainIdHex)};
const EXPECTED = ${JSON.stringify(tx.fromAddress.toLowerCase())};
const out = (m) => document.getElementById("out").textContent = m;
let account;
const send = (t) => window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, ...t }] });
document.getElementById("connect").onclick = async () => {
  if (!window.ethereum) return out("MetaMask not found");
  const [a] = await window.ethereum.request({ method: "eth_requestAccounts" });
  account = a;
  if (a.toLowerCase() !== EXPECTED) { out("⚠️ connected " + a + " but expected " + EXPECTED); return; }
  try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); } catch (e) { out("switch chain failed: " + (e.message||e)); return; }
  out("connected " + a + " on Base.\\nStep 2: Approve USDC, then Step 3: Send.");
  document.getElementById("approve").disabled = false;
};
document.getElementById("approve").onclick = async () => {
  try { out("approving USDC..."); const h = await send({ to: APPROVE.to, data: APPROVE.data }); out("✅ approve sent: " + h + "\\nWait for it to confirm, then click Send deposit."); document.getElementById("send").disabled = false; }
  catch (e) { out("❌ approve: " + (e.message||e)); }
};
document.getElementById("send").onclick = async () => {
  try { out("sending deposit..."); const h = await send({ to: TX.to, data: TX.data, value: TX.value }); out("✅ deposit sent: " + h + "\\n\\nMonitor the bridge:\\nMONITOR_TX=" + h + " pnpm --filter @keel/lifi validate:deposit"); }
  catch (e) { out("❌ deposit: " + (e.message||e)); }
};
</script>
</body></html>`;
}
