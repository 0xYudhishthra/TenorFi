// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {ProgramBuilder, Program} from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import {KeelOpcodes} from "./KeelOpcodes.sol";
import {FundingSettleArgsBuilder} from "./FundingSettle.sol";

/// @title KeelFundingProgram — builds the maker's funding-settlement order
/// @notice Program = a single `_fundingSettle` instruction. The maker (LP / payer) ships a
///         strategy holding {positionToken, USDC}; settlement is executed as a swap with
///         tokenIn = positionToken (amountIn = 0, hence `allowZeroAmountIn`), tokenOut = USDC
///         (amountOut = the netted funding payment the opcode computes). Mirrors
///         `AquaAMM.buildProgram`. Extends `KeelOpcodes` so `_fundingSettle` is in `_opcodes()`
///         at the same index the router dispatches.
contract KeelFundingProgram is KeelOpcodes {
    using ProgramBuilder for Program;

    constructor(address aqua) KeelOpcodes(aqua) {}

    function buildProgram(
        address maker,
        address fundingIndex,
        int256 fixedRate,
        uint256 cap,
        uint256 notional,
        uint256 periodSeconds
    ) external pure returns (ISwapVM.Order memory) {
        Program memory program = ProgramBuilder.init(_opcodes());
        bytes memory bytecode = program.build(
            _fundingSettle,
            FundingSettleArgsBuilder.build(fundingIndex, fixedRate, cap, notional, periodSeconds)
        );

        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                receiver: address(0),
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: true, // settlement: receiver pays 0 of the position token
                hasPreTransferInHook: false,
                hasPostTransferInHook: false,
                hasPreTransferOutHook: false,
                hasPostTransferOutHook: false,
                preTransferInTarget: address(0),
                preTransferInData: "",
                postTransferInTarget: address(0),
                postTransferInData: "",
                preTransferOutTarget: address(0),
                preTransferOutData: "",
                postTransferOutTarget: address(0),
                postTransferOutData: "",
                program: bytecode
            })
        );
    }
}
