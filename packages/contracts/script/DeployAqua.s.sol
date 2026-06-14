// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

import {KeelSwapVMRouter} from "../src/swapvm/KeelSwapVMRouter.sol";
import {KeelFundingProgram} from "../src/swapvm/KeelFundingProgram.sol";
import {MockERC20} from "../test/swapvm/MockERC20.sol";

/// @title DeployAqua — the Aqua/SwapVM settlement layer on Base mainnet
/// @notice Deploys ONLY the trade-execution layer: our custom SwapVM router (which carries the
///         `_fundingSettle` opcode), the order/program builder, and a position-marker token used as
///         the swap's `tokenIn` (SwapVM requires `tokenIn != tokenOut`).
///
///         This is split from the CRE funding-write stack (`DeployFunding.s.sol`) on purpose: the
///         two layers share state ONLY through `FundingIndex`, and the index address is supplied per
///         order at `buildProgram(... fundingIndex ...)` time — never a constructor arg here. So this
///         script reuses the **already-deployed** `FundingIndex` (the one the CRE workflow writes to)
///         without redeploying it, which is what keeps CRE writes and Aqua reads on the same latch.
///
///   forge script script/DeployAqua.s.sol:DeployAqua \
///     --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
contract DeployAqua is Script {
    /// @dev Canonical Base mainnet Aqua (verified on-chain). We deploy our OWN router against it.
    address internal constant BASE_AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31;

    struct Deployed {
        address aqua;
        KeelSwapVMRouter router;
        KeelFundingProgram program;
        MockERC20 positionToken;
    }

    /// @param aqua Existing Aqua to reuse; if zero, the canonical Base Aqua.
    function deploy(address aqua) public returns (Deployed memory d) {
        d.aqua = aqua == address(0) ? BASE_AQUA : aqua;
        d.router = new KeelSwapVMRouter(d.aqua, "Keel", "1.0.0");
        d.program = new KeelFundingProgram(d.aqua);
        // Position-marker ERC20: the swap's `tokenIn` (amountIn 0). Distinct from the settlement
        // token (`tokenOut`, USDC) so SwapVM's `tokenIn != tokenOut` invariant holds.
        d.positionToken = new MockERC20("Keel Position", "KPOS", 18);
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address aqua = vm.envOr("AQUA_ADDRESS", BASE_AQUA);

        vm.startBroadcast(pk);
        Deployed memory d = deploy(aqua);
        vm.stopBroadcast();

        _writeDeployments(d);
    }

    function _writeDeployments(Deployed memory d) internal {
        string memory k = "aqua";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "Aqua", d.aqua);
        vm.serializeAddress(k, "KeelSwapVMRouter", address(d.router));
        vm.serializeAddress(k, "PositionToken", address(d.positionToken));
        string memory json = vm.serializeAddress(k, "KeelFundingProgram", address(d.program));
        // Written separately so it does not clobber the CRE funding stack's deployments.json.
        vm.writeJson(json, "./deployments.aqua.json");
    }
}
