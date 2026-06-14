// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FundingSettle} from "../../src/swapvm/FundingSettle.sol";
import {TenorSwapVMRouter} from "../../src/swapvm/TenorSwapVMRouter.sol";
import {TenorFundingProgram} from "../../src/swapvm/TenorFundingProgram.sol";
import {MockFundingIndex} from "./MockFundingIndex.sol";
import {MockERC20} from "./MockERC20.sol";

interface IHasAqua {
    function AQUA() external view returns (address);
}

/// @notice Integration test against a **Base mainnet fork**: deploys our custom SwapVM router +
///         program pointed at the REAL deployed Aqua, and settles with REAL USDC. This catches
///         integration issues a local mock can't — address mismatches, Aqua version drift, and
///         real-token (proxy/decimals/fee-on-transfer) behaviour.
/// @dev    Gated on `BASE_RPC_URL`; skips when unset so the default `forge test` stays offline.
///         Run: `BASE_RPC_URL=https://mainnet.base.org forge test --match-contract BaseMainnetFork`
contract BaseMainnetForkTest is Test {
    // Canonical Base mainnet addresses (verified on-chain).
    address internal constant AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31;
    address internal constant SWAPVM = 0x8fDD04Dbf6111437B44bbca99C28882434e0958f;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint256 internal constant ONE = 1e18;
    uint256 internal constant PERIOD_SECONDS = 120;
    int256 internal constant F = int256(ONE / 100); // 1%
    uint256 internal constant CAP = (ONE * 4) / 100; // 4%
    uint256 internal constant N = 50_000 * 1e6; // 50,000 USDC notional
    int256 internal constant R = int256((ONE * 3) / 100); // realized 3% > F
    uint256 internal constant NET = 33_333_333; // (3%-1%) * 50,000 * 120/3600 (per-window scale)

    address internal lp = makeAddr("lp");
    address internal hedger = makeAddr("hedger");

    function _fork() internal returns (bool ok) {
        string memory rpc = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            return false;
        }
        vm.createSelectFork(rpc);
        return true;
    }

    /// @notice Double-checks the live addresses and that SwapVM points at the canonical Aqua.
    function test_addressesAndAquaWiring() public {
        if (!_fork()) {
            vm.skip(true);
            return;
        }
        assertGt(AQUA.code.length, 0, "Aqua has code");
        assertGt(SWAPVM.code.length, 0, "SwapVM has code");
        assertGt(USDC.code.length, 0, "USDC has code");
        assertEq(IHasAqua(SWAPVM).AQUA(), AQUA, "SwapVM uses the canonical Aqua");
        assertEq(IERC20Decimals(USDC).decimals(), 6, "USDC is 6 decimals");
    }

    /// @notice A real settlement executes through our opcode and moves REAL USDC via the REAL Aqua.
    function test_settlementMovesRealUSDC() public {
        if (!_fork()) {
            vm.skip(true);
            return;
        }

        TenorSwapVMRouter router = new TenorSwapVMRouter(AQUA, "TenorFi", "1.0.0");
        TenorFundingProgram program = new TenorFundingProgram(AQUA);
        MockFundingIndex idx = new MockFundingIndex();
        MockERC20 pos = new MockERC20("Keel Position", "KPOS", 18);

        // LP holds real USDC + a position token; Aqua only pulls at settlement.
        deal(USDC, lp, 5_000 * 1e6);
        pos.mint(lp, ONE);
        assertEq(IERC20(USDC).balanceOf(lp), 5_000 * 1e6, "deal funded LP with USDC");

        vm.warp((block.timestamp / PERIOD_SECONDS) * PERIOD_SECONDS + 10);
        idx.setFundingIndex(block.timestamp / PERIOD_SECONDS, R);

        ISwapVM.Order memory order =
            program.buildProgram(lp, address(idx), F, CAP, N, PERIOD_SECONDS, hedger, USDC);

        vm.startPrank(lp);
        IERC20(USDC).approve(AQUA, type(uint256).max);
        pos.approve(AQUA, type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = address(pos);
        tokens[1] = USDC;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ONE;
        amounts[1] = 5_000 * 1e6;
        IAqua(AQUA).ship(address(router), abi.encode(order), tokens, amounts);
        vm.stopPrank();

        bytes memory takerData = TakerTraitsLib.build(
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

        uint256 lpBefore = IERC20(USDC).balanceOf(lp);
        uint256 hedgerBefore = IERC20(USDC).balanceOf(hedger);

        vm.prank(hedger);
        router.swap(order, address(pos), USDC, 0, takerData);

        assertEq(IERC20(USDC).balanceOf(lp), lpBefore - NET, "LP pays net (real USDC)");
        assertEq(
            IERC20(USDC).balanceOf(hedger), hedgerBefore + NET, "hedger receives net (real USDC)"
        );

        // double-settle still guarded on the real Aqua
        vm.prank(hedger);
        vm.expectRevert(FundingSettle.AlreadySettled.selector);
        router.swap(order, address(pos), USDC, 0, takerData);
    }
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}
