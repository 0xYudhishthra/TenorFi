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

/// @notice End-to-end over real Aqua: the **subscription** model as ONE order, both directions, with
///         **zero subscriber collateral**. The reserve (maker) ships a USDC coverage balance; the
///         subscriber (taker) settles each period:
///           - coverage (`R > F`): subscriber receives `(R−F)·N` from the reserve — posts nothing;
///           - premium (`R < F`): `(F−R)·N` is pulled **from the subscriber's wallet** via Aqua —
///             nothing pre-locked, just an approval.
contract FundingSettleE2ETest is Test {
    uint256 internal constant ONE = 1e18;
    uint256 internal constant PERIOD_SECONDS = 60; // per-minute (demo)
    int256 internal constant F = int256(ONE / 100); // 1%
    uint256 internal constant CAP = (ONE * 4) / 100; // 4%
    uint256 internal constant N = 50_000 * 1e6; // 50,000 USDC notional

    Aqua internal aqua;
    KeelSwapVMRouter internal router;
    KeelFundingProgram internal program;
    MockFundingIndex internal idx;
    MockERC20 internal usdc;
    MockERC20 internal pos; // position-marker token

    address internal reserve = makeAddr("reserve");
    address internal subscriber = makeAddr("subscriber");

    function setUp() public {
        aqua = new Aqua();
        router = new KeelSwapVMRouter(address(aqua), "Keel", "1.0.0");
        program = new KeelFundingProgram(address(aqua));
        idx = new MockFundingIndex();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        pos = new MockERC20("TenorFi Position", "TPOS", 18);

        vm.warp(1_000_000);
    }

    function _order() internal view returns (ISwapVM.Order memory) {
        return program.buildProgram(reserve, address(idx), F, CAP, N, PERIOD_SECONDS, subscriber, address(usdc));
    }

    // The reserve ships its USDC coverage balance (and a marker) into Aqua.
    function _shipReserve(ISwapVM.Order memory order, uint256 coverage) internal {
        usdc.mint(reserve, coverage);
        pos.mint(reserve, ONE);
        vm.startPrank(reserve);
        usdc.approve(address(aqua), type(uint256).max);
        pos.approve(address(aqua), type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = address(pos);
        tokens[1] = address(usdc);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ONE;
        amounts[1] = coverage;
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

    // R > F: the reserve covers (R−F)·N → subscriber receives it, posts NOTHING.
    function test_coverage_RAboveF_subscriberPostsNothing() public {
        int256 r = int256((ONE * 3) / 100); // 3% > F
        uint256 net = uint256(r - F) * N * PERIOD_SECONDS / (ONE * 3600); // 2% * 50k = 1,000 USDC
        ISwapVM.Order memory order = _order();
        _shipReserve(order, 5_000 * 1e6);
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, r);

        assertEq(usdc.balanceOf(subscriber), 0, "subscriber starts with no USDC / no collateral");
        vm.prank(subscriber);
        router.swap(order, address(pos), address(usdc), 0, _takerData(subscriber));

        assertEq(usdc.balanceOf(subscriber), net, "subscriber received coverage");
    }

    // R < F: the premium (F−R)·N is pulled from the subscriber's WALLET — nothing pre-locked.
    function test_premium_RBelowF_pulledFromWallet() public {
        int256 r = 0; // below F
        uint256 premium = uint256(F - r) * N * PERIOD_SECONDS / (ONE * 3600); // 1% * 50k = 500 USDC
        ISwapVM.Order memory order = _order();
        _shipReserve(order, 5_000 * 1e6);
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, r);

        // Subscriber only holds USDC in their wallet + approves the router (the transferFrom spender)
        // — posts no collateral.
        usdc.mint(subscriber, premium);
        vm.prank(subscriber);
        usdc.approve(address(router), type(uint256).max);

        uint256 reserveBefore = usdc.balanceOf(reserve); // 0 (all shipped)
        vm.prank(subscriber);
        router.swap(order, address(usdc), address(pos), premium, _takerData(subscriber));

        assertEq(usdc.balanceOf(subscriber), 0, "premium pulled from the subscriber's wallet");
        assertEq(usdc.balanceOf(reserve), reserveBefore + premium, "premium collected by the reserve");
    }

    // Same period can't be settled twice.
    function test_doubleSettleReverts() public {
        int256 r = int256((ONE * 3) / 100);
        ISwapVM.Order memory order = _order();
        _shipReserve(order, 5_000 * 1e6);
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, r);
        vm.prank(subscriber);
        router.swap(order, address(pos), address(usdc), 0, _takerData(subscriber));
        vm.prank(subscriber);
        vm.expectRevert(FundingSettle.AlreadySettled.selector);
        router.swap(order, address(pos), address(usdc), 0, _takerData(subscriber));
    }

    // Only the bound subscriber can settle — no one else can intercept coverage.
    function test_strangerCannotSettle() public {
        int256 r = int256((ONE * 3) / 100);
        ISwapVM.Order memory order = _order();
        _shipReserve(order, 5_000 * 1e6);
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, r);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(FundingSettle.UnauthorizedTaker.selector);
        router.swap(order, address(pos), address(usdc), 0, _takerData(stranger));
    }
}
