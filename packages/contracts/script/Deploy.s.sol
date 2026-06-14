// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { FundingIndex } from "../src/FundingIndex.sol";
import { KeelSwap } from "../src/KeelSwap.sol";
import { KeelSwapVMRouter } from "../src/swapvm/KeelSwapVMRouter.sol";
import { KeelFundingProgram } from "../src/swapvm/KeelFundingProgram.sol";
import { MockUSDC } from "../test/mocks/MockUSDC.sol";

/// @title Deploy — Keel on Ethereum Sepolia
/// @notice Deploys the full stack (Aqua + the custom SwapVM router + program + settlement core +
///         a demo USDC) and writes `deployments.json`. Run on a real testnet:
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// @dev `deploy()` is split out (no broadcast) so it can be exercised by a wiring test.
contract Deploy is Script {
    struct Deployed {
        MockUSDC usdc;
        FundingIndex fundingIndex;
        KeelSwap keelSwap;
        Aqua aqua;
        KeelSwapVMRouter router;
        KeelFundingProgram program;
    }

    /// @param forwarder The CRE KeystoneForwarder authorised to write the funding index.
    function deploy(address forwarder) public returns (Deployed memory d) {
        d.usdc = new MockUSDC();
        d.fundingIndex = new FundingIndex(forwarder);
        d.keelSwap = new KeelSwap(address(d.usdc), address(d.fundingIndex));
        d.aqua = new Aqua();
        d.router = new KeelSwapVMRouter(address(d.aqua), "Keel", "1.0.0");
        d.program = new KeelFundingProgram(address(d.aqua));
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        // Default the CRE forwarder to the deployer; rotate later via FundingIndex.setForwarder.
        address forwarder = vm.envOr("CRE_FORWARDER", vm.addr(pk));

        vm.startBroadcast(pk);
        Deployed memory d = deploy(forwarder);
        vm.stopBroadcast();

        _writeDeployments(d);
    }

    function _writeDeployments(Deployed memory d) internal {
        string memory k = "keel";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "periodSeconds", 120);
        vm.serializeAddress(k, "MockUSDC", address(d.usdc));
        vm.serializeAddress(k, "FundingIndex", address(d.fundingIndex));
        vm.serializeAddress(k, "KeelSwap", address(d.keelSwap));
        vm.serializeAddress(k, "Aqua", address(d.aqua));
        vm.serializeAddress(k, "KeelSwapVMRouter", address(d.router));
        string memory json = vm.serializeAddress(k, "KeelFundingProgram", address(d.program));
        vm.writeJson(json, "./deployments.json");
    }
}
