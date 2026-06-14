// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";

import {FundingIndex} from "../src/FundingIndex.sol";
import {KeelFundingReceiver} from "../src/KeelFundingReceiver.sol";
import {KeelSwapVMRouter} from "../src/swapvm/KeelSwapVMRouter.sol";
import {KeelFundingProgram} from "../src/swapvm/KeelFundingProgram.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// @title Deploy — Keel on Base mainnet
/// @notice Deploys our own pieces (custom SwapVM router + program + CRE funding receiver + funding
///         latch) and **reuses the canonical, already-deployed Aqua + USDC** on Base mainnet;
///         writes `deployments.json`. Settlement runs entirely over Aqua via the `_fundingSettle`
///         opcode — there is no custodial settlement contract. Real funds/gas — fund the deployer
///         EOA with ETH first:
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// @dev `deploy()` is split out (no broadcast) so it can be exercised by a wiring test. Pass
///      `aqua`/`usdc` as zero to deploy mocks instead (local/test); pass real addresses to reuse.
contract Deploy is Script {
    /// @dev Canonical Base mainnet addresses (verified on-chain; `SwapVM.AQUA()` returns AQUA).
    address internal constant BASE_AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    struct Deployed {
        address usdc;
        address aqua;
        FundingIndex fundingIndex;
        KeelFundingReceiver receiver;
        KeelSwapVMRouter router;
        KeelFundingProgram program;
    }

    /// @param forwarder The CRE KeystoneForwarder that delivers DON reports to the receiver.
    /// @param relayer   The EOA fallback allowed to post reports when the DON is unavailable.
    /// @param aqua      Existing Aqua to reuse; if zero, deploy a fresh `Aqua` (local/test).
    /// @param usdc      Existing USDC to reuse; if zero, deploy a `MockUSDC` (local/test).
    function deploy(address forwarder, address relayer, address aqua, address usdc)
        public
        returns (Deployed memory d)
    {
        d.aqua = aqua == address(0) ? address(new Aqua()) : aqua;
        d.usdc = usdc == address(0) ? address(new MockUSDC()) : usdc;

        // Latch is deployed with the caller as a temporary forwarder, then re-pointed at the
        // canonical CRE receiver (resolves the receiver <-> index construction cycle).
        // `msg.sender` (not `address(this)`, which Foundry forbids in scripts) owns the index so
        // the setForwarder call below is authorized.
        d.fundingIndex = new FundingIndex(msg.sender);
        d.receiver = new KeelFundingReceiver(d.fundingIndex, forwarder, relayer);
        d.fundingIndex.setForwarder(address(d.receiver));

        d.router = new KeelSwapVMRouter(d.aqua, "Keel", "1.0.0");
        d.program = new KeelFundingProgram(d.aqua);
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address forwarder = vm.envOr("CRE_FORWARDER", vm.addr(pk)); // KeystoneForwarder; default deployer
        address relayer = vm.envOr("RELAYER", vm.addr(pk)); // EOA fallback; default deployer
        address aqua = vm.envOr("AQUA_ADDRESS", BASE_AQUA); // reuse canonical Aqua
        address usdc = vm.envOr("USDC_ADDRESS", BASE_USDC); // reuse canonical USDC

        vm.startBroadcast(pk);
        Deployed memory d = deploy(forwarder, relayer, aqua, usdc);
        vm.stopBroadcast();

        _writeDeployments(d, forwarder);
    }

    function _writeDeployments(Deployed memory d, address forwarder) internal {
        string memory k = "keel";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "periodSeconds", 120);
        vm.serializeAddress(k, "KeystoneForwarder", forwarder);
        vm.serializeAddress(k, "USDC", d.usdc);
        vm.serializeAddress(k, "Aqua", d.aqua);
        vm.serializeAddress(k, "FundingIndex", address(d.fundingIndex));
        vm.serializeAddress(k, "KeelFundingReceiver", address(d.receiver));
        vm.serializeAddress(k, "KeelSwapVMRouter", address(d.router));
        string memory json = vm.serializeAddress(k, "KeelFundingProgram", address(d.program));
        vm.writeJson(json, "./deployments.json");
    }
}
