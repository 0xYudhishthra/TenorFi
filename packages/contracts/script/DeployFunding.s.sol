// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

import {FundingIndex} from "../src/FundingIndex.sol";
import {KeelFundingReceiver} from "../src/KeelFundingReceiver.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// @title DeployFunding — the CRE funding-write stack on Base mainnet
/// @notice Deploys only the contracts on the Chainlink CRE write path (MockUSDC + FundingIndex +
///         KeelFundingReceiver) and writes `deployments.json`. This intentionally omits the
///         Aqua/SwapVM trade-execution layer (router/program in `Deploy.s.sol`), whose internal
///         function-pointer bytecode trips Foundry's constructor-arg decoder during broadcast.
///         Use this script to land a real CRE write; use `Deploy.s.sol` for the full stack.
///
///   forge script script/DeployFunding.s.sol:DeployFunding \
///     --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
contract DeployFunding is Script {
    struct Deployed {
        MockUSDC usdc;
        FundingIndex fundingIndex;
        KeelFundingReceiver receiver;
    }

    /// @param forwarder The CRE KeystoneForwarder (or simulation MockForwarder) that calls onReport.
    /// @param relayer   The EOA fallback allowed to post reports when the DON is unavailable.
    function deploy(address forwarder, address relayer) public returns (Deployed memory d) {
        d.usdc = new MockUSDC();
        // `msg.sender` owns the index (not `address(this)`, which Foundry forbids in scripts) so
        // the setForwarder call below is authorized; the constructor value is a placeholder.
        d.fundingIndex = new FundingIndex(msg.sender);
        d.receiver = new KeelFundingReceiver(d.fundingIndex, forwarder, relayer);
        d.fundingIndex.setForwarder(address(d.receiver));
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address forwarder = vm.envOr("CRE_FORWARDER", vm.addr(pk));
        address relayer = vm.envOr("RELAYER", vm.addr(pk));

        vm.startBroadcast(pk);
        Deployed memory d = deploy(forwarder, relayer);
        vm.stopBroadcast();

        _writeDeployments(d, forwarder);
    }

    function _writeDeployments(Deployed memory d, address forwarder) internal {
        string memory k = "keel";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "periodSeconds", 3600);
        vm.serializeAddress(k, "KeystoneForwarder", forwarder);
        vm.serializeAddress(k, "MockUSDC", address(d.usdc));
        vm.serializeAddress(k, "FundingIndex", address(d.fundingIndex));
        string memory json = vm.serializeAddress(k, "KeelFundingReceiver", address(d.receiver));
        vm.writeJson(json, "./deployments.json");
    }
}
