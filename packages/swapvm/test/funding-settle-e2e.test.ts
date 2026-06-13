import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { TakerTraitsLib } from "./utils/SwapVMHelpers";
const { ethers } = require("hardhat");

// End-to-end: a real funding settlement executes through our custom `_fundingSettle` SwapVM
// opcode and MOVES USDC on-chain (the 1inch Aqua-app bounty's "onchain token transfer").
// Framing: LP (maker) ships {POS, USDC}; the hedger (taker) executes a swap with
// tokenIn = POS (amountIn = 0), tokenOut = USDC (amountOut = net). When R > F the LP pays.

const ONE = 10n ** 18n;
const PERIOD_SECONDS = 120n;
const F = ONE / 100n; // 1% per period
const CAP = (ONE * 4n) / 100n; // 4%
const N = 50_000n * 10n ** 6n; // 50,000 USDC notional (1e6)
const R = (ONE * 3n) / 100n; // realized 3% > F
const NET = ((R - F) * N) / ONE; // (2%) * 50,000 = 1,000 USDC

describe("_fundingSettle e2e (Aqua + custom SwapVM opcode moves USDC)", () => {
  it("R > F: LP pays the hedger `net` USDC through the opcode", async () => {
    const [, lp, hedger] = await ethers.getSigners();

    const aqua = await (await ethers.getContractFactory("Aqua")).deploy();
    const router = await (await ethers.getContractFactory("KeelSwapVMRouter")).deploy(await aqua.getAddress(), "Keel", "1.0.0");
    const builder = await (await ethers.getContractFactory("KeelFundingProgram")).deploy(await aqua.getAddress());
    const idx = await (await ethers.getContractFactory("MockFundingIndex")).deploy();
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const pos = await (await ethers.getContractFactory("MockERC20")).deploy("Keel Position", "KPOS", 18);

    const [aquaAddr, routerAddr, idxAddr, usdcAddr, posAddr] = await Promise.all([
      aqua.getAddress(), router.getAddress(), idx.getAddress(), usdc.getAddress(), pos.getAddress(),
    ]);

    // LP funds + approves Aqua (collateral stays in-wallet; Aqua pulls only at settlement).
    const collateral = 5_000n * 10n ** 6n;
    await usdc.mint(await lp.getAddress(), collateral);
    await pos.mint(await lp.getAddress(), ONE);
    await usdc.connect(lp).approve(aquaAddr, ethers.MaxUint256);
    await pos.connect(lp).approve(aquaAddr, ethers.MaxUint256);

    // LP's funding-settlement order (program = [_fundingSettle(args)]).
    const order = await builder.buildProgram(await lp.getAddress(), idxAddr, F, CAP, N, PERIOD_SECONDS);
    const orderStruct = { maker: order.maker, traits: order.traits, data: order.data };
    await aqua.connect(lp).ship(
      routerAddr,
      ethers.AbiCoder.defaultAbiCoder().encode(["tuple(address maker, uint256 traits, bytes data)"], [orderStruct]),
      [posAddr, usdcAddr],
      [ONE, collateral],
    );

    // Pin a timestamp ~10s into a clean period, latch the funding rate for that period.
    const latest = await time.latest();
    const period = BigInt(Math.ceil((latest + 100) / 120));
    const target = period * 120n + 10n;
    await time.setNextBlockTimestamp(Number(target));
    await idx.setFundingIndex(period, R); // mines at `target`; contract derives target/120 = period

    // Hedger executes the settlement swap (exactIn, amountIn = 0 → amountOut = net).
    const takerData = TakerTraitsLib.build({
      taker: await hedger.getAddress(),
      isExactIn: true,
      threshold: 0n,
      useTransferFromAndAquaPush: true,
    });

    const tx = await router.connect(hedger).swap(orderStruct, posAddr, usdcAddr, 0n, takerData);

    await expect(tx).to.changeTokenBalances(usdc, [lp, hedger], [-NET, NET]);
    expect(NET).to.equal(1_000n * 10n ** 6n);
  });
});
