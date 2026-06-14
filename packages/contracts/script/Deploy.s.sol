// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";

import {FundingIndex} from "../src/FundingIndex.sol";
import {KeelFundingReceiver} from "../src/KeelFundingReceiver.sol";
import {TenorSwapVMRouter} from "../src/swapvm/TenorSwapVMRouter.sol";
import {TenorFundingProgram} from "../src/swapvm/TenorFundingProgram.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {MockERC20} from "../test/swapvm/MockERC20.sol";

/// @title Deploy — the full Keel stack on Base mainnet (one script)
/// @notice Deploys everything Keel owns in one shot: the funding latch + CRE receiver (write path),
///         the custom SwapVM router + program (settlement path), and a position-marker token. It
///         **reuses the canonical, already-deployed Aqua + USDC** on Base mainnet and writes
///         `deployments.json`. Settlement runs entirely over Aqua via the `_fundingSettle` opcode —
///         there is no custodial settlement contract. Real funds/gas — fund the deployer EOA with
///         ETH first:
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY --broadcast
///
/// @dev By default this REUSES the already-deployed, CRE-verified funding stack (`FundingIndex` +
///      `KeelFundingReceiver`) on Base mainnet and only deploys the Aqua settlement layer — so the
///      live CRE workflow keeps writing to the same latch with **nothing to repoint**. Pass
///      `fundingIndex`/`receiver` as zero (local/test) to deploy a fresh funding stack instead.
///      `deploy()` is split out (no broadcast) for the wiring test; pass `aqua`/`usdc` as zero to
///      deploy mocks (local/test), real addresses to reuse.
contract Deploy is Script {
    /// @dev Canonical Base mainnet addresses (verified on-chain; `SwapVM.AQUA()` returns AQUA).
    address internal constant BASE_AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @dev Live, CRE-verified funding stack on Base mainnet — reused by default (not redeployed).
    address internal constant BASE_FUNDING_INDEX = 0x545f162204A92CEbeb12AA0A4AaDF777d6905005;
    address internal constant BASE_FUNDING_RECEIVER = 0x7b7Ca2269f865C3448015173D433CcD7782aF582;

    /// @dev Settlement period (seconds) — must match the deployed CRE workflow's PERIOD_SECONDS and
    ///      the periodSeconds the order is built with. Informational in deployments.json (the value
    ///      is an order parameter, not stored on-chain).
    uint256 internal constant PERIOD_SECONDS = 3600;

    struct Deployed {
        address usdc;
        address aqua;
        FundingIndex fundingIndex;
        KeelFundingReceiver receiver;
        TenorSwapVMRouter router;
        TenorFundingProgram program;
        MockERC20 positionToken;
    }

    /// @param forwarder    CRE KeystoneForwarder (only used when deploying a fresh funding stack).
    /// @param relayer      EOA fallback (only used when deploying a fresh funding stack).
    /// @param aqua         Existing Aqua to reuse; if zero, deploy a fresh `Aqua` (local/test).
    /// @param usdc         Existing USDC to reuse; if zero, deploy a `MockUSDC` (local/test).
    /// @param fundingIndex Existing FundingIndex to reuse; if zero, deploy a fresh funding stack.
    /// @param receiver     Existing KeelFundingReceiver to reuse (paired with `fundingIndex`).
    function deploy(
        address forwarder,
        address relayer,
        address aqua,
        address usdc,
        address fundingIndex,
        address receiver
    ) public returns (Deployed memory d) {
        d.aqua = aqua == address(0) ? address(new Aqua()) : aqua;
        d.usdc = usdc == address(0) ? address(new MockUSDC()) : usdc;

        if (fundingIndex != address(0) && receiver != address(0)) {
            // Reuse the live, CRE-verified funding stack — do NOT redeploy (nothing to repoint).
            d.fundingIndex = FundingIndex(fundingIndex);
            d.receiver = KeelFundingReceiver(receiver);
        } else {
            // Fresh funding stack (local/test). The latch is deployed owned by the caller
            // (`msg.sender`, not `address(this)` which Foundry forbids in scripts) and re-pointed at
            // the new receiver, resolving the receiver <-> index construction cycle.
            d.fundingIndex = new FundingIndex(msg.sender);
            d.receiver = new KeelFundingReceiver(d.fundingIndex, forwarder, relayer);
            d.fundingIndex.setForwarder(address(d.receiver));
        }

        // Settlement layer: our own SwapVM router (carries `_fundingSettle`) + the order builder.
        d.router = new TenorSwapVMRouter(d.aqua, "TenorFi", "1.0.0");
        d.program = new TenorFundingProgram(d.aqua);

        // Position-marker token: the swap's `tokenIn` (amountIn 0), distinct from `tokenOut` (USDC)
        // so SwapVM's `tokenIn != tokenOut` invariant holds.
        d.positionToken = new MockERC20("Keel Position", "KPOS", 18);
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address forwarder = vm.envOr("CRE_FORWARDER", vm.addr(pk)); // only used if deploying fresh
        address relayer = vm.envOr("RELAYER", vm.addr(pk)); // only used if deploying fresh
        address aqua = vm.envOr("AQUA_ADDRESS", BASE_AQUA); // reuse canonical Aqua
        address usdc = vm.envOr("USDC_ADDRESS", BASE_USDC); // reuse canonical USDC
        address fundingIndex = vm.envOr("FUNDING_INDEX", BASE_FUNDING_INDEX); // reuse live latch
        address receiver = vm.envOr("FUNDING_RECEIVER", BASE_FUNDING_RECEIVER); // reuse live receiver

        vm.startBroadcast(pk);
        Deployed memory d = deploy(forwarder, relayer, aqua, usdc, fundingIndex, receiver);
        vm.stopBroadcast();

        _writeDeployments(d, forwarder);
    }

    function _writeDeployments(Deployed memory d, address forwarder) internal {
        string memory k = "keel";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "periodSeconds", PERIOD_SECONDS);
        vm.serializeAddress(k, "KeystoneForwarder", forwarder);
        vm.serializeAddress(k, "USDC", d.usdc);
        vm.serializeAddress(k, "Aqua", d.aqua);
        vm.serializeAddress(k, "FundingIndex", address(d.fundingIndex));
        vm.serializeAddress(k, "KeelFundingReceiver", address(d.receiver));
        vm.serializeAddress(k, "TenorSwapVMRouter", address(d.router));
        vm.serializeAddress(k, "TenorFundingProgram", address(d.program));
        string memory json = vm.serializeAddress(k, "PositionToken", address(d.positionToken));
        vm.writeJson(json, "./deployments.json");
    }
}
