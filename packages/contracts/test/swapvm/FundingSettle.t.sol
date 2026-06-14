// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {FundingSettle, FundingSettleArgsBuilder} from "../../src/swapvm/FundingSettle.sol";
import {FundingSettleHarness} from "./FundingSettleHarness.sol";
import {MockFundingIndex} from "./MockFundingIndex.sol";

/// @notice Unit tests for the `_fundingSettle` opcode: directional settlement, taker binding, and
///         the period guard. The harness uses a zero Context, so `ctx.query.taker == address(0)`;
///         math tests bind the order to `address(0)` to satisfy the taker check.
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
        vm.warp(1_000_000);
    }

    function _args(address counterparty, bool makerPaysAbove) internal view returns (bytes memory) {
        return FundingSettleArgsBuilder.build(
            address(idx), F, CAP, N, PERIOD_SECONDS, counterparty, makerPaysAbove
        );
    }

    function _period() internal view returns (uint256) {
        return block.timestamp / PERIOD_SECONDS;
    }

    // LP-pays-hedger leg: realized > fixed → maker owes (R - F) * N.
    function test_makerPaysAbove_RAboveF_pays() public {
        int256 r = int256((ONE * 3) / 100); // 3% > F
        idx.setFundingIndex(_period(), r);
        assertEq(harness.settle(_args(address(0), true)), uint256(r - F) * N / ONE);
    }

    // Mirror leg (maker = hedger): realized < fixed → maker owes (F - R) * N.
    function test_makerPaysBelow_RBelowF_pays() public {
        int256 r = 0; // below F
        idx.setFundingIndex(_period(), r);
        assertEq(harness.settle(_args(address(0), false)), uint256(F - r) * N / ONE);
    }

    // Wrong direction for this leg pays nothing (the mirror order handles it) — fixes the sign bug.
    function test_wrongDirection_paysZero() public {
        idx.setFundingIndex(_period(), 0); // R < F, but this is the maker-pays-above leg
        assertEq(harness.settle(_args(address(0), true)), 0);
    }

    function test_clampsToCap() public {
        int256 r = int256((ONE * 50) / 100); // 50% spike
        idx.setFundingIndex(_period(), r);
        assertEq(harness.settle(_args(address(0), true)), CAP * N / ONE);
    }

    function test_revertsWhenFundingUnset() public {
        vm.expectRevert(FundingSettle.FundingNotSet.selector);
        harness.settle(_args(address(0), true));
    }

    // Only the bound counterparty may take the order — third parties cannot intercept the payout.
    function test_revertsUnauthorizedTaker() public {
        idx.setFundingIndex(_period(), int256((ONE * 3) / 100));
        vm.expectRevert(FundingSettle.UnauthorizedTaker.selector);
        harness.settle(_args(address(0xBEEF), true)); // ctx taker is 0, != 0xBEEF
    }
}
