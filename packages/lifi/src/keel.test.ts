import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, type PublicClient } from "viem";
import { encodeKeelShipCall, KEEL_BASE } from "./keel.js";

// Offline: the order strategy comes from a real eth_call to KeelFundingProgram,
// so we stub the public client and assert the ship calldata is encoded correctly
// (target = Aqua, app = router, tokens = [POS, USDC], amounts = [posAmount, collateral]).
const SHIP_ABI = [
  {
    type: "function",
    name: "ship",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

test("encodeKeelShipCall encodes a well-formed Aqua ship call", async () => {
  const strategy = `0x${"ab".repeat(64)}` as `0x${string}`;
  const stubClient = { call: async () => ({ data: strategy }) } as unknown as PublicClient;

  const collateral = 10_000_000n; // 10 USDC
  const result = await encodeKeelShipCall({
    order: {
      maker: "0x1111111111111111111111111111111111111111",
      counterparty: "0x2222222222222222222222222222222222222222",
      fixedRate: 25_000_000_000_000_000n,
      cap: 40_000_000_000_000_000n,
      notional: 1_000_000_000n,
      makerPaysAbove: false,
    },
    collateral,
    publicClient: stubClient,
  });

  assert.equal(result.target.toLowerCase(), KEEL_BASE.aqua.toLowerCase());
  assert.equal(result.strategy, strategy);

  const decoded = decodeFunctionData({ abi: SHIP_ABI, data: result.calldata });
  assert.equal(decoded.functionName, "ship");
  const [app, shippedStrategy, tokens, amounts] = decoded.args as [
    string,
    string,
    readonly string[],
    readonly bigint[],
  ];
  assert.equal(app.toLowerCase(), KEEL_BASE.router.toLowerCase());
  assert.equal(shippedStrategy, strategy);
  assert.equal(tokens[0].toLowerCase(), KEEL_BASE.positionToken.toLowerCase());
  assert.equal(tokens[1].toLowerCase(), KEEL_BASE.usdc.toLowerCase());
  assert.equal(amounts[0], 10n ** 18n);
  assert.equal(amounts[1], collateral);
});
