// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { FundingIndex } from "../src/FundingIndex.sol";
import { KeelFundingReceiver } from "../src/KeelFundingReceiver.sol";
import { KeelSwap } from "../src/KeelSwap.sol";
import { KeelSwapVMRouter } from "../src/swapvm/KeelSwapVMRouter.sol";
import { KeelFundingProgram } from "../src/swapvm/KeelFundingProgram.sol";
import { MockUSDC } from "../test/mocks/MockUSDC.sol";

/// @title Deploy — Keel on Base mainnet
/// @notice Deploys the full stack (Aqua + the custom SwapVM router + program + settlement core +
///         the CRE funding receiver + a demo USDC) and writes `deployments.json`. Run on
///         Base mainnet (chain id 8453) — real funds/gas, fund the deployer EOA with ETH first:
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// @dev `deploy()` is split out (no broadcast) so it can be exercised by a wiring test.
contract Deploy is Script {
    struct Deployed {
        MockUSDC usdc;
        FundingIndex fundingIndex;
        KeelFundingReceiver receiver;
        KeelSwap keelSwap;
        Aqua aqua;
        KeelSwapVMRouter router;
        KeelFundingProgram program;
    }

    /// @param forwarder The CRE KeystoneForwarder that delivers DON reports to the receiver.
    /// @param relayer   The EOA fallback allowed to post reports when the DON is unavailable.
    function deploy(address forwarder, address relayer) public returns (Deployed memory d) {
        d.usdc = new MockUSDC();
        // Latch is deployed with the deployer as a temporary forwarder, then re-pointed at the
        // canonical CRE receiver below (resolves the receiver <-> index construction cycle).
        d.fundingIndex = new FundingIndex(address(this));
        d.receiver = new KeelFundingReceiver(d.fundingIndex, forwarder, relayer);
        d.fundingIndex.setForwarder(address(d.receiver));
        d.keelSwap = new KeelSwap(address(d.usdc), address(d.fundingIndex));
        d.aqua = new Aqua();
        d.router = new KeelSwapVMRouter(address(d.aqua), "Keel", "1.0.0");
        d.program = new KeelFundingProgram(address(d.aqua));
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        // CRE KeystoneForwarder on Base mainnet; defaults to the deployer until known.
        address forwarder = vm.envOr("CRE_FORWARDER", vm.addr(pk));
        // EOA relayer fallback; defaults to the deployer.
        address relayer = vm.envOr("RELAYER", vm.addr(pk));

        vm.startBroadcast(pk);
        Deployed memory d = deploy(forwarder, relayer);
        vm.stopBroadcast();

        _writeDeployments(d, forwarder);
    }

    function _writeDeployments(Deployed memory d, address forwarder) internal {
        string memory k = "keel";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "periodSeconds", 120);
        vm.serializeAddress(k, "KeystoneForwarder", forwarder);
        vm.serializeAddress(k, "MockUSDC", address(d.usdc));
        vm.serializeAddress(k, "FundingIndex", address(d.fundingIndex));
        vm.serializeAddress(k, "KeelFundingReceiver", address(d.receiver));
        vm.serializeAddress(k, "KeelSwap", address(d.keelSwap));
        vm.serializeAddress(k, "Aqua", address(d.aqua));
        vm.serializeAddress(k, "KeelSwapVMRouter", address(d.router));
        string memory json = vm.serializeAddress(k, "KeelFundingProgram", address(d.program));
        vm.writeJson(json, "./deployments.json");
    }
}
