// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";
import { SwapVM } from "@1inch/swap-vm/src/SwapVM.sol";

import { KeelOpcodes } from "./KeelOpcodes.sol";

/// @title KeelSwapVMRouter — a SwapVM router with Keel's custom `_fundingSettle` opcode
/// @notice Mirrors 1inch's `AquaSwapVMRouter` (`Simulator, SwapVM, AquaOpcodes`) but swaps in
///         `KeelOpcodes`, which appends `_fundingSettle`. Deploy this instead of the canonical
///         SwapVM to execute Keel funding-settlement programs (the bounty explicitly allows
///         deploying your own SwapVM with custom instructions).
contract KeelSwapVMRouter is Simulator, SwapVM, KeelOpcodes {
    constructor(address aqua, address weth, address owner, string memory name, string memory version)
        SwapVM(aqua, weth, owner, name, version)
        KeelOpcodes(aqua)
    { }

    /// @dev The instruction set the VM dispatches against = our extended opcode set.
    function _instructions()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory)
    {
        return _opcodes();
    }
}
