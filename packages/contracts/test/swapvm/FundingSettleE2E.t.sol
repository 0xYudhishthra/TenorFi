// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";

import {FundingSettle} from "../../src/swapvm/FundingSettle.sol";
import {KeelSwapVMRouter} from "../../src/swapvm/KeelSwapVMRouter.sol";
import {KeelFundingProgram} from "../../src/swapvm/KeelFundingProgram.sol";
import {MockFundingIndex} from "./MockFundingIndex.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice End-to-end: a real funding settlement executes through `_fundingSettle` and MOVES USDC.
///         LP (maker) ships {POS, USDC}; the order is bound to the hedger (taker); tokenIn = POS
///         (amountIn = 0), tokenOut = USDC (amountOut = net). R > F leg (makerPaysAbove).
contract FundingSettleE2ETest is Test {
    uint256 internal constant ONE = 1e18;
    uint256 internal constant PERIOD_SECONDS = 120;
    int256 internal constant F = int256(ONE / 100); // 1%
    uint256 internal constant CAP = (ONE * 4) / 100; // 4%
    uint256 internal constant N = 50_000 * 1e6; // 50,000 USDC notional
    int256 internal constant R = int256((ONE * 3) / 100); // realized 3% > F
    uint256 internal constant NET = 1_000 * 1e6; // (3%-1%) * 50,000 = 1,000 USDC

    Aqua internal aqua;
    KeelSwapVMRouter internal router;
    KeelFundingProgram internal program;
    MockFundingIndex internal idx;
    MockERC20 internal usdc;
    MockERC20 internal pos;

    address internal lp = makeAddr("lp");
    address internal hedger = makeAddr("hedger");

    function setUp() public {
        aqua = new Aqua();
        router = new KeelSwapVMRouter(address(aqua), "Keel", "1.0.0");
        program = new KeelFundingProgram(address(aqua));
        idx = new MockFundingIndex();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        pos = new MockERC20("Keel Position", "KPOS", 18);

        usdc.mint(lp, 5_000 * 1e6);
        pos.mint(lp, ONE);

        vm.warp(1_000_000);
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, R);
    }

    function _ship() internal returns (ISwapVM.Order memory order) {
        // maker = LP, counterparty (taker) = hedger, maker pays when realized > fixed
        order = program.buildProgram(lp, address(idx), F, CAP, N, PERIOD_SECONDS, hedger, true);

        vm.startPrank(lp);
        usdc.approve(address(aqua), type(uint256).max);
        pos.approve(address(aqua), type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = address(pos);
        tokens[1] = address(usdc);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ONE;
        amounts[1] = 5_000 * 1e6;
        aqua.ship(address(router), abi.encode(order), tokens, amounts);
        vm.stopPrank();
    }

    function _takerData(address taker) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: true,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: "",
                to: address(0),
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }

    function test_settlementMovesUSDC_RAboveF() public {
        ISwapVM.Order memory order = _ship();
        uint256 lpBefore = usdc.balanceOf(lp);
        uint256 hedgerBefore = usdc.balanceOf(hedger);

        vm.prank(hedger);
        router.swap(order, address(pos), address(usdc), 0, _takerData(hedger));

        assertEq(usdc.balanceOf(lp), lpBefore - NET, "LP pays net");
        assertEq(usdc.balanceOf(hedger), hedgerBefore + NET, "hedger receives net");
    }

    function test_doubleSettleReverts() public {
        ISwapVM.Order memory order = _ship();
        vm.prank(hedger);
        router.swap(order, address(pos), address(usdc), 0, _takerData(hedger));

        vm.prank(hedger);
        vm.expectRevert(FundingSettle.AlreadySettled.selector);
        router.swap(order, address(pos), address(usdc), 0, _takerData(hedger));
    }

    // A non-counterparty cannot take the order and steal the LP's payout (audit #2).
    function test_strangerCannotTake() public {
        ISwapVM.Order memory order = _ship();
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(FundingSettle.UnauthorizedTaker.selector);
        router.swap(order, address(pos), address(usdc), 0, _takerData(stranger));
    }

    // No-default, the Aqua way: a maker who ships exactly one period's worst-case max (cap × notional)
    // always covers the worst possible period; a second worst-case period it never funded reverts at
    // the Aqua layer (insufficient virtual balance) rather than creating unbacked debt. The cap is the
    // per-period bound, the shipped virtual balance is the collateral, and Aqua can never push tokens
    // the maker did not ship — so a credited taker is always fully backed and no side can be overdrawn.
    function test_noDefault_shipFloorCoversWorstCase_underfundedPeriodReverts() public {
        uint256 floor = (CAP * N) / ONE; // cap × notional = 2,000 USDC = one period's max

        // LP ships EXACTLY the no-default floor (not the generous 5,000 of _ship()).
        ISwapVM.Order memory order =
            program.buildProgram(lp, address(idx), F, CAP, N, PERIOD_SECONDS, hedger, true);
        vm.startPrank(lp);
        usdc.approve(address(aqua), type(uint256).max);
        pos.approve(address(aqua), type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = address(pos);
        tokens[1] = address(usdc);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ONE;
        amounts[1] = floor;
        aqua.ship(address(router), abi.encode(order), tokens, amounts);
        vm.stopPrank();

        // Period A: a spike far past the cap clamps to cap and settles to EXACTLY the floor — the
        // worst possible period is fully covered, draining the shipped balance to zero.
        uint256 pA = block.timestamp / PERIOD_SECONDS;
        idx.setFundingIndex(pA, int256((ONE * 50) / 100)); // 50% → clamps to 4% cap
        uint256 hedgerBefore = usdc.balanceOf(hedger);
        vm.prank(hedger);
        router.swap(order, address(pos), address(usdc), 0, _takerData(hedger));
        assertEq(usdc.balanceOf(hedger), hedgerBefore + floor, "worst-case period fully covered");

        // Period B: the maker never funded a second worst-case period. Settlement reverts (no tokens
        // to push) instead of creating unbacked debt — the no-default guarantee.
        vm.warp(block.timestamp + PERIOD_SECONDS);
        uint256 pB = block.timestamp / PERIOD_SECONDS;
        idx.setFundingIndex(pB, int256((ONE * 50) / 100));
        vm.prank(hedger);
        vm.expectRevert();
        router.swap(order, address(pos), address(usdc), 0, _takerData(hedger));
    }

    // Two shipped orders per position: a Keel position is the LP-pays-above leg AND the hedger-pays-below
    // mirror leg. Here we ship BOTH and settle the R < F window through real Aqua — the mirror leg moves
    // (F - R) * N from the hedger (maker) to the LP (bound taker). Proves the full two-order model
    // end-to-end, not just the harness unit (`test_makerPaysBelow_RBelowF_pays`).
    function test_twoLegs_RBelowF_mirrorLegPaysLP() public {
        uint256 floor = (CAP * N) / ONE; // 2,000 USDC per leg

        // Leg 1 — LP ships the pays-above order (bound taker = hedger).
        ISwapVM.Order memory lpLeg =
            program.buildProgram(lp, address(idx), F, CAP, N, PERIOD_SECONDS, hedger, true);
        address[] memory tokens = new address[](2);
        tokens[0] = address(pos);
        tokens[1] = address(usdc);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ONE;
        amounts[1] = floor;
        vm.startPrank(lp);
        usdc.approve(address(aqua), type(uint256).max);
        pos.approve(address(aqua), type(uint256).max);
        aqua.ship(address(router), abi.encode(lpLeg), tokens, amounts);
        vm.stopPrank();

        // Leg 2 — the hedger ships the mirror pays-below order (bound taker = LP).
        usdc.mint(hedger, floor);
        pos.mint(hedger, ONE);
        ISwapVM.Order memory hedgerLeg =
            program.buildProgram(hedger, address(idx), F, CAP, N, PERIOD_SECONDS, lp, false);
        vm.startPrank(hedger);
        usdc.approve(address(aqua), type(uint256).max);
        pos.approve(address(aqua), type(uint256).max);
        aqua.ship(address(router), abi.encode(hedgerLeg), tokens, amounts);
        vm.stopPrank();

        // R < F window: the mirror leg pays (F - R) * N from hedger → LP through real Aqua.
        vm.warp(block.timestamp + PERIOD_SECONDS);
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, 0); // R = 0 < F
        uint256 expected = uint256(F) * N / ONE; // (F - 0) * N = 500 USDC
        uint256 lpBefore = usdc.balanceOf(lp);
        uint256 hedgerBefore = usdc.balanceOf(hedger);

        vm.prank(lp);
        router.swap(hedgerLeg, address(pos), address(usdc), 0, _takerData(lp));

        assertEq(usdc.balanceOf(lp), lpBefore + expected, "LP receives (F-R)*N on the mirror leg");
        assertEq(usdc.balanceOf(hedger), hedgerBefore - expected, "hedger pays the mirror leg");
    }
}
