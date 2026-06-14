// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {ProgramBuilder, Program} from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import {TenorOpcodes} from "./TenorOpcodes.sol";
import {FundingSettleArgsBuilder} from "./FundingSettle.sol";

/// @title TenorFundingProgram — builds the reserve's funding-subscription order
/// @notice Program = a single `_fundingSettle` instruction serving BOTH directions of one
///         subscription. The maker (the insurance reserve) ships a strategy holding {positionToken,
///         USDC}. Each period the bound `subscriber` (taker) settles:
///           - coverage (`R > F`): swap tokenIn = positionToken (amountIn 0), tokenOut = USDC — the
///             opcode sets `amountOut`, paid from the reserve's balance to the subscriber;
///           - premium (`R < F`): swap tokenIn = USDC, tokenOut = positionToken — the opcode sets
///             `amountIn`, pulled from the subscriber's wallet into the reserve.
///         `allowZeroAmountIn` covers the coverage direction; the premium direction has `amountIn > 0`.
///         Extends `TenorOpcodes` so `_fundingSettle` is in `_opcodes()` at the dispatch index.
contract TenorFundingProgram is TenorOpcodes {
    using ProgramBuilder for Program;

    constructor(address aqua) TenorOpcodes(aqua) {}

    /// @param maker           The insurance reserve (covers funding, collects premium).
    /// @param subscriber      The only address allowed to settle this subscription (the taker).
    /// @param settlementToken USDC — pulled in (premium) / paid out (coverage).
    function buildProgram(
        address maker,
        address fundingIndex,
        int256 fixedRate,
        uint256 cap,
        uint256 notional,
        uint256 periodSeconds,
        address subscriber,
        address settlementToken
    ) external pure returns (ISwapVM.Order memory) {
        Program memory program = ProgramBuilder.init(_opcodes());
        bytes memory bytecode = program.build(
            _fundingSettle,
            FundingSettleArgsBuilder.build(
                fundingIndex, fixedRate, cap, notional, periodSeconds, subscriber, settlementToken
            )
        );

        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                receiver: address(0),
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: true, // coverage direction: taker provides 0 of the position token
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
