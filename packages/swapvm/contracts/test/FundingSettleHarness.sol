// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";

import { FundingSettle } from "../FundingSettle.sol";

/// @notice Exposes the internal `_fundingSettle` opcode for unit testing. A zero-initialised
///         Context is sufficient because the instruction only reads `args` + the funding index
///         and writes `ctx.swap.amountOut`.
contract FundingSettleHarness is FundingSettle {
    function settle(bytes calldata args) external view returns (uint256 amountOut) {
        Context memory ctx;
        _fundingSettle(ctx, args);
        return ctx.swap.amountOut;
    }
}
