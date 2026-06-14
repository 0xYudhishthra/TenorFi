// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Context} from "@1inch/swap-vm/src/libs/VM.sol";

import {FundingSettle} from "../../src/swapvm/FundingSettle.sol";

/// @notice Exposes the internal `_fundingSettle` opcode for unit testing. Lets the test set the
///         Context's taker + tokenIn/tokenOut (which the subscription opcode reads) and returns both
///         settlement registers.
contract FundingSettleHarness is FundingSettle {
    function settle(bytes calldata args, address taker, address tokenIn, address tokenOut)
        external
        returns (uint256 amountIn, uint256 amountOut)
    {
        Context memory ctx;
        ctx.query.taker = taker;
        ctx.query.tokenIn = tokenIn;
        ctx.query.tokenOut = tokenOut;
        _fundingSettle(ctx, args);
        return (ctx.swap.amountIn, ctx.swap.amountOut);
    }
}
