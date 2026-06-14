// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import { Deploy } from "../script/Deploy.s.sol";

/// @notice Exercises the deploy script's `deploy()` (no broadcast) and asserts the stack is
///         deployed and wired — a dry-run before the real Ethereum Sepolia broadcast.
contract DeployTest is Test {
    function test_deployWiring() public {
        Deploy dep = new Deploy();
        address forwarder = address(0xCAFE);
        Deploy.Deployed memory d = dep.deploy(forwarder);

        // every contract has code
        assertGt(address(d.usdc).code.length, 0, "usdc");
        assertGt(address(d.fundingIndex).code.length, 0, "fundingIndex");
        assertGt(address(d.keelSwap).code.length, 0, "keelSwap");
        assertGt(address(d.aqua).code.length, 0, "aqua");
        assertGt(address(d.router).code.length, 0, "router");
        assertGt(address(d.program).code.length, 0, "program");

        // settlement core wired to the right collateral token + funding index
        assertEq(address(d.keelSwap.collateralToken()), address(d.usdc));
        assertEq(address(d.keelSwap.fundingIndex()), address(d.fundingIndex));
        assertEq(d.fundingIndex.forwarder(), forwarder);

        // the program builder produces a non-empty funding-settlement order
        ISwapVM.Order memory order =
            d.program.buildProgram(address(0xBEEF), address(d.fundingIndex), int256(1e16), 4e16, 50_000e6, 120);
        assertEq(order.maker, address(0xBEEF));
        assertGt(order.data.length, 0, "program bytecode");
    }
}
