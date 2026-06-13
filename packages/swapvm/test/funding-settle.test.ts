import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
const { ethers } = require("hardhat");

// Unit tests for the `_fundingSettle` opcode logic (amountOut = clamp(R - F, ±cap) * N / 1e18).
// The full router+Aqua e2e (ship -> execute -> assert USDC transfer) is the follow-up test,
// modelled on swap-vm-template/test/AquaAMM.test.ts.

const ONE = 10n ** 18n; // 1e18 rate scale
const PERIOD_SECONDS = 120n;

// F = 1% per period, cap = 4% per period, N = 50,000 USDC (1e6)
const F = ONE / 100n; // 1e16
const CAP = (ONE * 4n) / 100n; // 4e16
const N = 50_000n * 10n ** 6n;

describe("_fundingSettle (opcode unit)", () => {
  async function deploy() {
    const idx = await (await ethers.getContractFactory("MockFundingIndex")).deploy();
    const harness = await (await ethers.getContractFactory("FundingSettleHarness")).deploy();
    return { idx, harness, idxAddr: await idx.getAddress() };
  }

  function buildArgs(idxAddr: string) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "int256", "uint256", "uint256", "uint256"],
      [idxAddr, F, CAP, N, PERIOD_SECONDS],
    );
  }

  // Pin the next block to a future timestamp and return the period the contract will derive.
  async function pinPeriod(): Promise<bigint> {
    const target = BigInt(await time.latest()) + 1000n;
    await time.setNextBlockTimestamp(Number(target));
    return target / PERIOD_SECONDS;
  }

  it("R > F: hedger credited net = (R - F) * N / 1e18", async () => {
    const { idx, harness, idxAddr } = await deploy();
    const period = await pinPeriod();
    const R = (ONE * 3n) / 100n; // 3% > F
    await idx.setFundingIndex(period, R); // mines at the pinned timestamp
    expect(await harness.settle(buildArgs(idxAddr))).to.equal(((R - F) * N) / ONE);
  });

  it("R < F: net = (F - R) * N / 1e18 (premium to LP)", async () => {
    const { idx, harness, idxAddr } = await deploy();
    const period = await pinPeriod();
    const R = 0n; // below F
    await idx.setFundingIndex(period, R);
    expect(await harness.settle(buildArgs(idxAddr))).to.equal(((F - R) * N) / ONE);
  });

  it("clamps |R - F| to cap (no-default bound)", async () => {
    const { idx, harness, idxAddr } = await deploy();
    const period = await pinPeriod();
    const R = (ONE * 50n) / 100n; // 50% spike, far above F + cap
    await idx.setFundingIndex(period, R);
    expect(await harness.settle(buildArgs(idxAddr))).to.equal((CAP * N) / ONE);
  });

  it("reverts when the funding index for the period is unset", async () => {
    const { harness, idxAddr } = await deploy();
    await pinPeriod();
    await ethers.provider.send("evm_mine", []); // advance to the pinned ts without setting the index
    await expect(harness.settle(buildArgs(idxAddr))).to.be.revertedWithCustomError(harness, "FundingNotSet");
  });
});
