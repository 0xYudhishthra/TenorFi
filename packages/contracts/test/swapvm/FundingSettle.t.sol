// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {FundingSettle, FundingSettleArgsBuilder} from "../../src/swapvm/FundingSettle.sol";
import {FundingSettleHarness} from "./FundingSettleHarness.sol";
import {MockFundingIndex} from "./MockFundingIndex.sol";

/// @notice Unit tests for the `_fundingSettle` subscription opcode: one order, both directions, zero
///         subscriber collateral. Coverage (`R > F`) sets `amountOut` (reserve pays); premium
///         (`R < F`) sets `amountIn` (pulled from the subscriber's wallet). Plus taker-binding, the
///         period guard, the cap, and the settlement-token guard.
contract FundingSettleTest is Test {
    uint256 internal constant ONE = 1e18;
    uint256 internal constant PERIOD_SECONDS = 60; // per-minute (demo)
    int256 internal constant F = int256(ONE / 100); // 1% per period
    uint256 internal constant CAP = (ONE * 4) / 100; // 4% per period
    uint256 internal constant N = 50_000 * 1e6; // 50,000 USDC

    address internal constant USDC = address(0x5DC);
    address internal constant MARKER = address(0xB0B);

    FundingSettleHarness internal harness;
    MockFundingIndex internal idx;
    address internal subscriber = makeAddr("subscriber");

    function setUp() public {
        harness = new FundingSettleHarness();
        idx = new MockFundingIndex();
        vm.warp(1_000_000);
    }

    function _args() internal view returns (bytes memory) {
        return FundingSettleArgsBuilder.build(address(idx), F, CAP, N, PERIOD_SECONDS, subscriber, USDC);
    }

    function _period() internal view returns (uint256) {
        return block.timestamp / PERIOD_SECONDS;
    }

    // R > F: the reserve covers the funding → opcode sets amountOut (paid to the subscriber).
    function test_coverage_RAboveF_paysOut() public {
        int256 r = int256((ONE * 3) / 100); // 3% > F
        idx.setFundingIndex(_period(), r);
        (uint256 amtIn, uint256 amtOut) = harness.settle(_args(), subscriber, MARKER, USDC);
        assertEq(amtIn, 0, "no premium pulled");
        assertEq(amtOut, uint256(r - F) * N * PERIOD_SECONDS / (ONE * 3600), "reserve covers (R-F)*N");
    }

    // R < F: the subscriber pays the premium → opcode sets amountIn (pulled from their wallet).
    function test_premium_RBelowF_pullsIn() public {
        int256 r = 0; // below F
        idx.setFundingIndex(_period(), r);
        (uint256 amtIn, uint256 amtOut) = harness.settle(_args(), subscriber, USDC, MARKER);
        assertEq(amtOut, 1, "1-wei marker receipt (SwapVM requires amountOut > 0)");
        assertEq(amtIn, uint256(F - r) * N * PERIOD_SECONDS / (ONE * 3600), "premium (F-R)*N pulled from wallet");
    }

    // Funding can go negative; for the subscriber that is still the premium direction (R < F).
    function test_premium_negativeFunding_pullsIn() public {
        int256 r = -int256((ONE * 2) / 100); // -2%
        idx.setFundingIndex(_period(), r);
        (uint256 amtIn,) = harness.settle(_args(), subscriber, USDC, MARKER);
        assertEq(amtIn, uint256(F - r) * N * PERIOD_SECONDS / (ONE * 3600)); // (1% + 2%) * N, |diff| < cap
    }

    function test_coverage_clampsToCap() public {
        int256 r = int256((ONE * 50) / 100); // 50% spike
        idx.setFundingIndex(_period(), r);
        (, uint256 amtOut) = harness.settle(_args(), subscriber, MARKER, USDC);
        assertEq(amtOut, CAP * N * PERIOD_SECONDS / (ONE * 3600)); // clamped to cap
    }

    function test_zeroDiff_movesNothing() public {
        idx.setFundingIndex(_period(), F); // R == F
        (uint256 amtIn, uint256 amtOut) = harness.settle(_args(), subscriber, USDC, MARKER);
        assertEq(amtIn, 0);
        assertEq(amtOut, 0);
    }

    // Only the bound subscriber may settle their subscription.
    function test_revertsUnauthorizedTaker() public {
        idx.setFundingIndex(_period(), int256((ONE * 3) / 100));
        vm.expectRevert(FundingSettle.UnauthorizedTaker.selector);
        harness.settle(_args(), makeAddr("intruder"), MARKER, USDC);
    }

    function test_revertsFundingNotSet() public {
        vm.expectRevert(FundingSettle.FundingNotSet.selector);
        harness.settle(_args(), subscriber, MARKER, USDC);
    }

    // Coverage with the wrong tokenOut (not USDC) reverts — the reserve can't be made to pay a marker.
    function test_coverage_wrongTokenOut_reverts() public {
        idx.setFundingIndex(_period(), int256((ONE * 3) / 100));
        vm.expectRevert(FundingSettle.WrongToken.selector);
        harness.settle(_args(), subscriber, MARKER, MARKER); // tokenOut = MARKER, not USDC
    }

    // Premium with the wrong tokenIn (not USDC) reverts — the subscriber can't pay in a worthless marker.
    function test_premium_wrongTokenIn_reverts() public {
        idx.setFundingIndex(_period(), 0); // R < F
        vm.expectRevert(FundingSettle.WrongToken.selector);
        harness.settle(_args(), subscriber, MARKER, MARKER); // tokenIn = MARKER, not USDC
    }

    // Keeper fires in a later (unwritten) period → reverts FundingNotSet, never a stale settle.
    function test_latePeriod_revertsFundingNotSet() public {
        idx.setFundingIndex(_period(), int256((ONE * 3) / 100));
        vm.warp(block.timestamp + PERIOD_SECONDS);
        vm.expectRevert(FundingSettle.FundingNotSet.selector);
        harness.settle(_args(), subscriber, MARKER, USDC);
    }
}
