// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { FundingSettle, FundingSettleArgsBuilder } from "../../src/swapvm/FundingSettle.sol";
import { FundingSettleHarness } from "./FundingSettleHarness.sol";
import { MockFundingIndex } from "./MockFundingIndex.sol";

/// @notice Unit tests for the `_fundingSettle` opcode logic:
///         amountOut = clamp(R - F, ±cap) * N / 1e18.
contract FundingSettleTest is Test {
    uint256 internal constant ONE = 1e18;
    uint256 internal constant PERIOD_SECONDS = 120;
    int256 internal constant F = int256(ONE / 100); // 1% per period
    uint256 internal constant CAP = (ONE * 4) / 100; // 4% per period
    uint256 internal constant N = 50_000 * 1e6; // 50,000 USDC

    FundingSettleHarness internal harness;
    MockFundingIndex internal idx;

    function setUp() public {
        harness = new FundingSettleHarness();
        idx = new MockFundingIndex();
        vm.warp(1_000_000); // deterministic timestamp -> deterministic period
    }

    function _args() internal view returns (bytes memory) {
        return FundingSettleArgsBuilder.build(address(idx), F, CAP, N, PERIOD_SECONDS);
    }

    function _period() internal view returns (uint256) {
        return block.timestamp / PERIOD_SECONDS;
    }

    function test_RAboveF_hedgerCredited() public {
        int256 r = int256((ONE * 3) / 100); // 3% > F
        idx.setFundingIndex(_period(), r);
        assertEq(harness.settle(_args()), uint256(r - F) * N / ONE);
    }

    function test_RBelowF_premiumToLp() public {
        int256 r = 0; // below F
        idx.setFundingIndex(_period(), r);
        assertEq(harness.settle(_args()), uint256(F - r) * N / ONE);
    }

    function test_clampsToCap() public {
        int256 r = int256((ONE * 50) / 100); // 50% spike, far above F + cap
        idx.setFundingIndex(_period(), r);
        assertEq(harness.settle(_args()), CAP * N / ONE);
    }

    function test_revertsWhenFundingUnset() public {
        vm.expectRevert(FundingSettle.FundingNotSet.selector);
        harness.settle(_args());
    }
}
