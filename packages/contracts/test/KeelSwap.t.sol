// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {KeelSwap} from "../src/KeelSwap.sol";
import {FundingIndex} from "../src/FundingIndex.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract KeelSwapTest is Test {
    KeelSwap internal keel;
    FundingIndex internal idx;
    MockUSDC internal usdc;

    address internal forwarder = makeAddr("forwarder");
    address internal hedger = makeAddr("hedger");
    address internal speculator = makeAddr("speculator");

    // $1M notional, hourly funding cap of 0.0411% => $411 max owed per hour.
    uint256 internal constant NOTIONAL = 1_000_000e6; // USDC 1e6
    int256 internal constant FIXED = 100e12; // 0.01% per period, 1e18
    uint256 internal constant CAP = 411e12; // 0.0411% per period, 1e18
    uint256 internal constant MAX_PERIOD = 411e6; // CAP * NOTIONAL / 1e18 = $411

    uint256 internal constant START = 10;
    uint256 internal constant END = 20;

    function setUp() public {
        idx = new FundingIndex(forwarder);
        usdc = new MockUSDC();
        keel = new KeelSwap(address(usdc), address(idx));

        usdc.mint(hedger, 1_000_000e6);
        usdc.mint(speculator, 1_000_000e6);
        vm.prank(hedger);
        usdc.approve(address(keel), type(uint256).max);
        vm.prank(speculator);
        usdc.approve(address(keel), type(uint256).max);
    }

    // --- helpers ---

    function _open(uint256 hCol, uint256 sCol) internal returns (uint256 id) {
        vm.prank(hedger); // a named party must open
        id = keel.open(hedger, speculator, NOTIONAL, FIXED, CAP, START, END, hCol, sCol);
    }

    function _setFunding(uint256 period, int256 value) internal {
        vm.prank(forwarder);
        idx.setFundingIndex(period, value);
    }

    function _collat(uint256 id) internal view returns (uint256 h, uint256 s) {
        (,,,,,,, h, s,) = keel.swaps(id);
    }

    // --- sanity ---

    function test_maxPeriodAmount_matchesPrelockedMax() public view {
        assertEq(keel.maxPeriodAmount(CAP, NOTIONAL), MAX_PERIOD); // $411
    }

    // --- open ---

    function test_open_pullsCollateralAndStoresTerms() public {
        uint256 id = _open(10_000e6, 10_000e6);

        assertEq(usdc.balanceOf(address(keel)), 20_000e6);
        assertEq(usdc.balanceOf(hedger), 1_000_000e6 - 10_000e6);
        (uint256 h, uint256 s) = _collat(id);
        assertEq(h, 10_000e6);
        assertEq(s, 10_000e6);
    }

    function test_open_revertsBelowOnePeriodMax() public {
        vm.expectRevert(KeelSwap.InsufficientCollateral.selector);
        _open(MAX_PERIOD - 1, MAX_PERIOD);
    }

    function test_open_revertsSameParty() public {
        vm.prank(hedger);
        vm.expectRevert(KeelSwap.SamePartySwap.selector);
        keel.open(hedger, hedger, NOTIONAL, FIXED, CAP, START, END, 10_000e6, 10_000e6);
    }

    function test_open_revertsForNonParticipant() public {
        vm.prank(makeAddr("intruder"));
        vm.expectRevert(KeelSwap.NotParticipant.selector);
        keel.open(hedger, speculator, NOTIONAL, FIXED, CAP, START, END, 10_000e6, 10_000e6);
    }

    // --- net cashflow math ---

    function test_settle_realizedAboveFixed_creditsHedger() public {
        uint256 id = _open(10_000e6, 10_000e6);
        // realized 0.02% - fixed 0.01% = +0.01% diff (within cap) => $100 on $1M.
        _setFunding(START, 200e12);
        keel.settle(id, START);

        (uint256 h, uint256 s) = _collat(id);
        assertEq(h, 10_000e6 + 100e6); // hedger receives floating
        assertEq(s, 10_000e6 - 100e6); // speculator pays
    }

    function test_settle_realizedBelowFixed_creditsSpeculator() public {
        uint256 id = _open(10_000e6, 10_000e6);
        // realized -0.03% - fixed 0.01% = -0.04% diff (|.| within cap) => $400.
        _setFunding(START, -300e12);
        keel.settle(id, START);

        (uint256 h, uint256 s) = _collat(id);
        assertEq(h, 10_000e6 - 400e6); // hedger pays the gap
        assertEq(s, 10_000e6 + 400e6); // speculator credited
    }

    function test_settle_zeroDiff_movesNothing() public {
        uint256 id = _open(10_000e6, 10_000e6);
        _setFunding(START, FIXED); // realized == fixed
        keel.settle(id, START);

        (uint256 h, uint256 s) = _collat(id);
        assertEq(h, 10_000e6);
        assertEq(s, 10_000e6);
    }

    // --- the cap ---

    function test_settle_capsLargePositiveDiff() public {
        uint256 id = _open(10_000e6, 10_000e6);
        _setFunding(START, 50_000e12); // realized far above fixed
        (int256 diff, uint256 amount) = keel.previewSettle(id, 50_000e12);
        assertEq(diff, int256(CAP)); // clamped to +cap
        assertEq(amount, MAX_PERIOD); // $411, not more

        keel.settle(id, START);
        (uint256 h, uint256 s) = _collat(id);
        assertEq(h, 10_000e6 + MAX_PERIOD);
        assertEq(s, 10_000e6 - MAX_PERIOD);
    }

    function test_settle_capsLargeNegativeDiff() public {
        uint256 id = _open(10_000e6, 10_000e6);
        _setFunding(START, -50_000e12); // realized far below fixed
        keel.settle(id, START);

        (uint256 h, uint256 s) = _collat(id);
        assertEq(h, 10_000e6 - MAX_PERIOD); // hedger pays at most $411
        assertEq(s, 10_000e6 + MAX_PERIOD);
    }

    // --- conservation invariant ---

    function test_settle_conservesTotalCollateral() public {
        uint256 id = _open(10_000e6, 10_000e6);
        uint256 totalBefore = 20_000e6;

        _setFunding(START, 250e12);
        keel.settle(id, START);
        _setFunding(START + 1, -500e12);
        keel.settle(id, START + 1);
        _setFunding(START + 2, 5_000_000e12); // capped
        keel.settle(id, START + 2);

        (uint256 h, uint256 s) = _collat(id);
        assertEq(h + s, totalBefore); // settlement only moves, never creates/destroys
        assertEq(usdc.balanceOf(address(keel)), totalBefore); // tokens still fully held
    }

    // --- no-default invariant ---

    function test_noDefault_prelockedMaxAlwaysCoversAndSolventSideIsPaidInFull() public {
        // Each side pre-locks exactly one period's max ($411). The worst possible
        // hourly move is fully covered up front; once a side is drained, its leg can
        // no longer settle, but the counterparty keeps everything credited.
        uint256 id = _open(MAX_PERIOD, MAX_PERIOD);

        // Period 1: realized blows past the cap. Speculator owes the clamped max ($411).
        _setFunding(START, 999_999e12);
        keel.settle(id, START);

        (uint256 h, uint256 s) = _collat(id);
        assertEq(h, MAX_PERIOD + MAX_PERIOD); // hedger credited the full $411
        assertEq(s, 0); // speculator drained, never negative

        // Period 2: speculator is dry -> its leg cannot pay; no unbacked debt is created.
        _setFunding(START + 1, 999_999e12);
        vm.expectRevert(KeelSwap.InsufficientCollateral.selector);
        keel.settle(id, START + 1);

        // The solvent hedger withdraws everything credited — paid in full.
        uint256 hedgerBalBefore = usdc.balanceOf(hedger);
        vm.prank(hedger);
        keel.close(id);
        assertEq(usdc.balanceOf(hedger), hedgerBalBefore + 2 * MAX_PERIOD);
    }

    // --- no double settle ---

    function test_settle_noDoubleSettle() public {
        uint256 id = _open(10_000e6, 10_000e6);
        _setFunding(START, 200e12);
        keel.settle(id, START);

        vm.expectRevert(KeelSwap.AlreadySettled.selector);
        keel.settle(id, START);
    }

    // --- guards ---

    function test_settle_revertsWhenFundingNotSet() public {
        uint256 id = _open(10_000e6, 10_000e6);
        vm.expectRevert(KeelSwap.FundingNotSet.selector);
        keel.settle(id, START);
    }

    function test_settle_revertsPeriodOutOfRange() public {
        uint256 id = _open(10_000e6, 10_000e6);
        _setFunding(START - 1, 200e12);
        vm.expectRevert(KeelSwap.PeriodOutOfRange.selector);
        keel.settle(id, START - 1);
    }

    // --- close ---

    function test_close_returnsBalancesAndBlocksFurtherSettle() public {
        uint256 id = _open(10_000e6, 10_000e6);
        _setFunding(START, 200e12);
        keel.settle(id, START); // hedger +100, speculator -100

        uint256 hBefore = usdc.balanceOf(hedger);
        uint256 sBefore = usdc.balanceOf(speculator);

        vm.prank(speculator);
        keel.close(id);

        assertEq(usdc.balanceOf(hedger), hBefore + 10_100e6);
        assertEq(usdc.balanceOf(speculator), sBefore + 9_900e6);
        assertEq(usdc.balanceOf(address(keel)), 0);

        _setFunding(START + 1, 200e12);
        vm.expectRevert(KeelSwap.SwapClosedError.selector);
        keel.settle(id, START + 1);
    }

    function test_close_revertsForNonParticipant() public {
        uint256 id = _open(10_000e6, 10_000e6);
        vm.prank(makeAddr("intruder"));
        vm.expectRevert(KeelSwap.NotParticipant.selector);
        keel.close(id);
    }
}
