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

/// @notice End-to-end: a real funding settlement executes through the custom `_fundingSettle`
///         SwapVM opcode and MOVES USDC on-chain. Framing: the LP (maker) ships {POS, USDC};
///         the hedger (taker) runs a swap with tokenIn = POS (amountIn = 0), tokenOut = USDC
///         (amountOut = net). When R > F the LP pays the hedger.
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

        // LP collateral stays in-wallet; Aqua only pulls at settlement.
        usdc.mint(lp, 5_000 * 1e6);
        pos.mint(lp, ONE);

        vm.warp(1_000_000); // deterministic timestamp -> period
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, R);
    }

    function _ship() internal returns (ISwapVM.Order memory order) {
        order = program.buildProgram(lp, address(idx), F, CAP, N, PERIOD_SECONDS);

        vm.startPrank(lp);
        usdc.approve(address(aqua), type(uint256).max);
        pos.approve(address(aqua), type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = address(pos);
        tokens[1] = address(usdc);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ONE; // POS nominal
        amounts[1] = 5_000 * 1e6; // USDC collateral
        aqua.ship(address(router), abi.encode(order), tokens, amounts);
        vm.stopPrank();
    }

    function _takerData() internal view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: hedger,
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
        router.swap(order, address(pos), address(usdc), 0, _takerData());

        assertEq(usdc.balanceOf(lp), lpBefore - NET, "LP pays net");
        assertEq(usdc.balanceOf(hedger), hedgerBefore + NET, "hedger receives net");
    }

    function test_doubleSettleReverts() public {
        ISwapVM.Order memory order = _ship();

        vm.prank(hedger);
        router.swap(order, address(pos), address(usdc), 0, _takerData());

        // same order, same period must not settle twice
        vm.prank(hedger);
        vm.expectRevert(FundingSettle.AlreadySettled.selector);
        router.swap(order, address(pos), address(usdc), 0, _takerData());
    }
}
