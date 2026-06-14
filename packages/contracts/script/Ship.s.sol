// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {KeelFundingProgram} from "../src/swapvm/KeelFundingProgram.sol";
import {MockERC20} from "../test/swapvm/MockERC20.sol";

/// @title Ship — the insurance reserve stands up as the counterparty on Base mainnet
/// @notice Builds the reserve's funding-settlement order (pays the hedger when `realized > fixed`)
///         against the LIVE deployment and `ship`s it into Aqua, posting real USDC as the reserve's
///         collateral (a virtual balance — it stays in the reserve's wallet until settlement pulls
///         the net). The order is taker-bound to `HEDGER`.
///
///         The reserve wallet (PRIVATE_KEY) must already hold ≥ COLLATERAL of real USDC.
///         Minimum COLLATERAL = cap × notional (one period's worst-case payout).
///
///   PRIVATE_KEY=0x... HEDGER=0x... NOTIONAL=100000000 COLLATERAL=10000000 \
///     forge script script/Ship.s.sol:Ship --rpc-url $BASE_RPC_URL --broadcast
///
/// @dev The order is deterministic from its params (`buildProgram` is pure), so the keeper/taker
///      rebuilds the identical order from `order-params.json` — no need to persist the struct itself.
contract Ship is Script {
    // Live Base mainnet deployment (deployments.json).
    address internal constant AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31;
    address internal constant ROUTER = 0x3a526bdb3249512580760A703248c3E0700766E9;
    address internal constant PROGRAM = 0x5A6f0876EDe0797ee126a32a616875862BfcF6EB;
    address internal constant POS = 0x6514B382a2a5BaeAF5c17ab6A02c5A1fB511FfB9;
    address internal constant FUNDING_INDEX = 0x545f162204A92CEbeb12AA0A4AaDF777d6905005;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint256 internal constant PERIOD_SECONDS = 3600; // must match the deployed CRE config

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY"); // the reserve wallet
        address reserve = vm.addr(pk);
        address hedger = vm.envAddress("HEDGER"); // the bound counterparty (taker)
        uint256 notional = vm.envOr("NOTIONAL", uint256(100e6)); // 100 USDC default
        uint256 collateral = vm.envOr("COLLATERAL", uint256(10e6)); // 10 USDC default ship
        // The quoted fixed rate (FFR) is a per-order value — re-quote by shipping a new order at a
        // new FIXED_RATE; existing positions keep their locked rate. Defaults: 1% FFR, 4% cap.
        int256 fixedRate = vm.envOr("FIXED_RATE", int256(1e16));
        uint256 cap = vm.envOr("CAP", uint256(4e16));

        uint256 floor = (cap * notional) / 1e18; // one period's worst-case = the no-default minimum
        require(collateral >= floor, "COLLATERAL below cap*notional floor");
        require(IERC20(USDC).balanceOf(reserve) >= collateral, "reserve USDC balance < COLLATERAL");
        require(hedger != reserve, "hedger must differ from reserve");

        // Reserve leg: pays the hedger when realized > fixed.
        ISwapVM.Order memory order = KeelFundingProgram(PROGRAM)
            .buildProgram(
                reserve, FUNDING_INDEX, fixedRate, cap, notional, PERIOD_SECONDS, hedger, true
            );

        vm.startBroadcast(pk);
        MockERC20(POS).mint(reserve, 1e18); // position-marker (tokenIn, amountIn 0) — free
        IERC20(USDC).approve(AQUA, type(uint256).max);
        IERC20(POS).approve(AQUA, type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = POS;
        tokens[1] = USDC;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = collateral;
        IAqua(AQUA).ship(ROUTER, abi.encode(order), tokens, amounts);
        vm.stopBroadcast();

        console2.log("Reserve shipped order into Aqua. maker:", reserve);
        console2.log("  hedger (taker):", hedger);
        console2.log("  notional (USDC 1e6):", notional);
        console2.log("  collateral shipped (USDC 1e6):", collateral);
        console2.log("  floor cap*notional (USDC 1e6):", floor);

        _writeOrderParams(reserve, hedger, notional, collateral, fixedRate, cap);
    }

    /// @dev Persists the order params so the keeper rebuilds the identical order via `buildProgram`.
    function _writeOrderParams(
        address reserve,
        address hedger,
        uint256 notional,
        uint256 collateral,
        int256 fixedRate,
        uint256 cap
    ) internal {
        string memory k = "order";
        vm.serializeAddress(k, "router", ROUTER);
        vm.serializeAddress(k, "program", PROGRAM);
        vm.serializeAddress(k, "aqua", AQUA);
        vm.serializeAddress(k, "fundingIndex", FUNDING_INDEX);
        vm.serializeAddress(k, "positionToken", POS);
        vm.serializeAddress(k, "usdc", USDC);
        vm.serializeAddress(k, "maker_reserve", reserve);
        vm.serializeAddress(k, "counterparty_hedger", hedger);
        vm.serializeInt(k, "fixedRate", fixedRate);
        vm.serializeUint(k, "cap", cap);
        vm.serializeUint(k, "notional", notional);
        vm.serializeUint(k, "periodSeconds", PERIOD_SECONDS);
        vm.serializeUint(k, "collateral", collateral);
        string memory json = vm.serializeBool(k, "makerPaysAbove", true);
        vm.writeJson(json, "./order-params.json");
    }
}
