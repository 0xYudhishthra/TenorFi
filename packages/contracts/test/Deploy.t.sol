// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import {Deploy} from "../script/Deploy.s.sol";

/// @notice Exercises the deploy script's `deploy()` (no broadcast) and asserts the stack is
///         deployed and wired — a dry-run before the real Base mainnet broadcast.
contract DeployTest is Test {
    function test_deployWiring() public {
        Deploy dep = new Deploy();
        address forwarder = address(0xCAFE);
        address relayer = address(0xBEE5);
        // zero aqua/usdc -> deploy mocks (local dry-run)
        // zero fundingIndex/receiver -> deploy a fresh funding stack (local/test path)
        Deploy.Deployed memory d =
            dep.deploy(forwarder, relayer, address(0), address(0), address(0), address(0));

        // every contract has code
        assertGt(d.usdc.code.length, 0, "usdc");
        assertGt(address(d.fundingIndex).code.length, 0, "fundingIndex");
        assertGt(address(d.receiver).code.length, 0, "receiver");
        assertGt(d.aqua.code.length, 0, "aqua");
        assertGt(address(d.router).code.length, 0, "router");
        assertGt(address(d.program).code.length, 0, "program");
        assertGt(address(d.positionToken).code.length, 0, "positionToken");

        // the settlement router points at the canonical Aqua it was constructed with
        assertEq(address(d.router.AQUA()), d.aqua);

        // the position marker is a non-USDC token (tokenIn != tokenOut for SwapVM)
        assertEq(d.positionToken.decimals(), 18, "position token 18dp");
        assertTrue(address(d.positionToken) != d.usdc, "position token != settlement token");

        // the CRE receiver is the index's authorized writer, and the receiver knows its
        // forwarder + relayer + target index
        assertEq(d.fundingIndex.forwarder(), address(d.receiver));
        assertEq(address(d.receiver.fundingIndex()), address(d.fundingIndex));
        assertEq(d.receiver.forwarder(), forwarder);
        assertEq(d.receiver.relayer(), relayer);

        // the program builder produces a non-empty funding-settlement order
        ISwapVM.Order memory order = d.program
            .buildProgram(
                address(0xBEEF),
                address(d.fundingIndex),
                int256(1e16),
                4e16,
                50_000e6,
                3600, // periodSeconds — matches the deployed CRE config
                address(0xCAFE),
                true
            );
        assertEq(order.maker, address(0xBEEF));
        assertGt(order.data.length, 0, "program bytecode");
    }

    /// @notice The live-deploy path: reuse an existing FundingIndex + receiver (do NOT redeploy them),
    ///         deploy only the Aqua settlement layer.
    function test_deployReusesFundingStack() public {
        Deploy dep = new Deploy();

        // first, a fresh stack to obtain a real FundingIndex + receiver to "reuse"
        Deploy.Deployed memory live = dep.deploy(
            address(0xCAFE), address(0xBEE5), address(0), address(0), address(0), address(0)
        );

        // now redeploy reusing that funding stack
        Deploy.Deployed memory d = dep.deploy(
            address(0xCAFE),
            address(0xBEE5),
            address(0),
            address(0),
            address(live.fundingIndex),
            address(live.receiver)
        );

        // funding stack is the SAME (reused, not redeployed)
        assertEq(address(d.fundingIndex), address(live.fundingIndex), "FundingIndex reused");
        assertEq(address(d.receiver), address(live.receiver), "receiver reused");

        // the Aqua layer is freshly deployed (distinct from the first run) and has code
        assertTrue(address(d.router) != address(live.router), "router is fresh");
        assertGt(address(d.router).code.length, 0, "router code");
        assertGt(address(d.program).code.length, 0, "program code");
        assertGt(address(d.positionToken).code.length, 0, "position token code");
    }
}
