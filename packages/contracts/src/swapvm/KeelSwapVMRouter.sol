// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Simulator} from "@1inch/swap-vm/src/libs/Simulator.sol";

import {Context} from "@1inch/swap-vm/src/libs/VM.sol";
import {SwapVM} from "@1inch/swap-vm/src/SwapVM.sol";

import {KeelOpcodes} from "./KeelOpcodes.sol";

/// @title KeelSwapVMRouter — a SwapVM router that includes the `_fundingSettle` instruction
/// @notice Composes `Simulator, SwapVM, KeelOpcodes`, where `KeelOpcodes` extends the standard
///         Aqua opcode set with `_fundingSettle`. Deploy this router to execute funding-
///         settlement programs.
contract KeelSwapVMRouter is Simulator, SwapVM, KeelOpcodes {
    constructor(address aqua, string memory name, string memory version)
        SwapVM(aqua, name, version)
        KeelOpcodes(aqua)
    {}

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
