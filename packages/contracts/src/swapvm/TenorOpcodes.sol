// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Context} from "@1inch/swap-vm/src/libs/VM.sol";
import {AquaOpcodes} from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";

import {FundingSettle} from "./FundingSettle.sol";

/// @title TenorOpcodes — Aqua opcode set extended with `_fundingSettle`
/// @notice Shared base for the router (execution) and the program builder (encoding), so the
///         bytecode opcode index of `_fundingSettle` is identical on both sides. The custom
///         instruction is appended at the END of the set, preserving every existing index
///         (the convention the swap-vm comments require for backward compatibility).
abstract contract TenorOpcodes is AquaOpcodes, FundingSettle {
    constructor(address aqua) AquaOpcodes(aqua) {}

    function _opcodes()
        internal
        pure
        virtual
        override
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        function(Context memory, bytes calldata) internal[] memory base = AquaOpcodes._opcodes();
        result = new function(Context memory, bytes calldata) internal[](base.length + 1);
        for (uint256 i = 0; i < base.length; i++) {
            result[i] = base[i];
        }
        result[base.length] = _fundingSettle; // ProgramBuilder.findOpcode() resolves the index
    }
}
