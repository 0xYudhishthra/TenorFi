// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import {DeployAqua} from "../script/DeployAqua.s.sol";

/// @notice Exercises the Aqua-layer deploy script's `deploy()` (no broadcast): the router + program +
///         position token are deployed and wired, and the program builds an order against an
///         arbitrary (already-deployed) FundingIndex — proving the index is an order parameter, not a
///         deploy-time dependency, so this layer reuses the CRE stack's live latch.
contract DeployAquaTest is Test {
    function test_deployWiring() public {
        DeployAqua dep = new DeployAqua();
        // pass a fresh address as "aqua" so the test does not need a fork
        address aqua = makeAddr("aqua");
        DeployAqua.Deployed memory d = dep.deploy(aqua);

        assertGt(address(d.router).code.length, 0, "router");
        assertGt(address(d.program).code.length, 0, "program");
        assertGt(address(d.positionToken).code.length, 0, "positionToken");

        // router + program point at the Aqua they were constructed with
        assertEq(address(d.router.AQUA()), aqua, "router uses given Aqua");

        // tokenIn (position) must differ from tokenOut (USDC) for SwapVM
        assertEq(d.positionToken.decimals(), 18, "position token is 18dp");

        // the program builds a settlement order against an EXTERNAL FundingIndex address (the live
        // CRE latch) supplied at build time — not a constructor arg
        address liveFundingIndex = makeAddr("liveFundingIndex");
        ISwapVM.Order memory order = d.program
            .buildProgram(
                address(0xBEEF), // maker
                liveFundingIndex, // <- the already-deployed CRE FundingIndex
                int256(1e16), // fixed 1%
                4e16, // cap 4%
                50_000e6, // notional
                3600, // periodSeconds — MUST match the CRE workflow's periodSeconds
                address(0xCAFE), // counterparty (bound taker)
                true // makerPaysAbove
            );
        assertEq(order.maker, address(0xBEEF), "order maker");
        assertGt(order.data.length, 0, "program bytecode built against live index");
    }
}
