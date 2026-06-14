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

  // floor = cap*notional/1e18 = 4e16 * 1e9 / 1e18 = 4e7 = 40 USDC; ship >= floor.
  const collateral = 40_000_000n; // 40 USDC (== floor)
  const result = await encodeKeelShipCall({
    order: {
      maker: "0x1111111111111111111111111111111111111111", // LP / reserve proxy
      subscriber: "0x2222222222222222222222222222222222222222", // hedger
      fixedRate: 25_000_000_000_000_000n,
      cap: 40_000_000_000_000_000n,
      notional: 1_000_000_000n,
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

test("encodeKeelShipCall rejects collateral below the cap*notional floor", async () => {
  const stubClient = { call: async () => ({ data: "0x" }) } as unknown as PublicClient;
  // floor = 4e16 * 1e9 / 1e18 = 40 USDC; 39.999999 USDC is below it.
  await assert.rejects(
    encodeKeelShipCall({
      order: {
        maker: "0x1111111111111111111111111111111111111111",
        subscriber: "0x2222222222222222222222222222222222222222",
        fixedRate: 0n,
        cap: 40_000_000_000_000_000n,
        notional: 1_000_000_000n,
      },
      collateral: 39_999_999n,
      publicClient: stubClient,
    }),
    /no-default/,
  );
});
