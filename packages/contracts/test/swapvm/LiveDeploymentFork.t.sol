// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {KeelSwapVMRouter} from "../../src/swapvm/KeelSwapVMRouter.sol";
import {KeelFundingProgram} from "../../src/swapvm/KeelFundingProgram.sol";
import {FundingIndex} from "../../src/FundingIndex.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Integration test against the ACTUAL deployed Keel stack on Base mainnet — the live router,
///         program, position token, and `FundingIndex` (with a value the live Chainlink CRE workflow
///         wrote), settling real USDC through the real Aqua. This is the end-to-end proof that the
///         wired-up, deployed system settles against real on-chain Chainlink data — distinct from
///         `BaseMainnetFork` (which deploys fresh contracts against real Aqua).
/// @dev    Gated on `BASE_RPC_URL`; skips when unset.
contract LiveDeploymentForkTest is Test {
    // Deployed on Base mainnet (deployments.json).
    address internal constant AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31;
    address internal constant ROUTER = 0x3a526bdb3249512580760A703248c3E0700766E9;
    address internal constant PROGRAM = 0x5A6f0876EDe0797ee126a32a616875862BfcF6EB;
    address internal constant POS = 0x6514B382a2a5BaeAF5c17ab6A02c5A1fB511FfB9;
    address internal constant FUNDING_INDEX = 0x545f162204A92CEbeb12AA0A4AaDF777d6905005;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint256 internal constant PERIOD_SECONDS = 3600;

    // A period the live CRE workflow wrote, verified on-chain (Axel's deploy commit):
    // FundingIndex.getFundingIndex(494834) == (12500000000000, true) — Hyperliquid BTC funding
    // 0.0000125 scaled to 1e18.
    uint256 internal constant LIVE_PERIOD = 494834;
    int256 internal constant LIVE_R = 12_500_000_000_000; // 1.25e13

    address internal lp = makeAddr("lp");
    address internal hedger = makeAddr("hedger");

    function _fork() internal returns (bool ok) {
        string memory rpc = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return false;
        vm.createSelectFork(rpc);
        return true;
    }

    /// @notice The deployed FundingIndex holds exactly the value the live CRE workflow wrote.
    function test_liveFundingIndex_hasCREValue() public {
        if (!_fork()) {
            vm.skip(true);
            return;
        }
        (int256 r, bool set) = FundingIndex(FUNDING_INDEX).getFundingIndex(LIVE_PERIOD);
        assertTrue(set, "period latched by CRE");
        assertEq(r, LIVE_R, "value == verified CRE write");
    }

    /// @notice The DEPLOYED router + program settle against the DEPLOYED FundingIndex's real CRE value,
    ///         moving real USDC through the real Aqua. `F` is set below the realized rate so the reserve
    ///         pays the hedger (the `realized > fixed` protection-payout direction).
    function test_deployedStack_settlesRealCREValue() public {
        if (!_fork()) {
            vm.skip(true);
            return;
        }

        // The deployed router/program at these addresses run the OLD (net) opcode; the source has
        // migrated to the subscription opcode. Re-point these addresses after the TenorFi redeploy.
        vm.skip(true);
        return;

        // solhint-disable-next-line no-unreachable
        KeelSwapVMRouter router = KeelSwapVMRouter(ROUTER);
        KeelFundingProgram program = KeelFundingProgram(PROGRAM);
        assertEq(address(router.AQUA()), AQUA, "deployed router uses canonical Aqua");

        int256 F = 1_000_000_000_000; // 1e12 — fixed below the real R so the reserve pays
        uint256 CAP = 4e16; // 4%
        uint256 N = 50_000 * 1e6; // 50k notional
        uint256 net = uint256(LIVE_R - F) * N / 1e18; // clamp not binding (diff < cap)

        ISwapVM.Order memory order =
            program.buildProgram(lp, FUNDING_INDEX, F, CAP, N, PERIOD_SECONDS, hedger, USDC);

        // Fund the reserve (lp): real USDC + the deployed position-marker token.
        deal(USDC, lp, 5_000 * 1e6);
        MockERC20(POS).mint(lp, 1e18);

        // Warp into the live period's window so the opcode reads LIVE_PERIOD.
        vm.warp(LIVE_PERIOD * PERIOD_SECONDS + 10);

        vm.startPrank(lp);
        IERC20(USDC).approve(AQUA, type(uint256).max);
        IERC20(POS).approve(AQUA, type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = POS;
        tokens[1] = USDC;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 5_000 * 1e6;
        IAqua(AQUA).ship(ROUTER, abi.encode(order), tokens, amounts);
        vm.stopPrank();

        uint256 hedgerBefore = IERC20(USDC).balanceOf(hedger);
        vm.prank(hedger);
        router.swap(order, POS, USDC, 0, _takerData(hedger));

        assertEq(
            IERC20(USDC).balanceOf(hedger),
            hedgerBefore + net,
            "hedger received the netted real-CRE settlement"
        );
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
}
