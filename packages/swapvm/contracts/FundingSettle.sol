// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context, ContextLib } from "@1inch/swap-vm/src/libs/VM.sol";

interface IFundingIndex {
    function getFundingIndex(uint256 period) external view returns (int256 value, bool set);
}

/// @notice Builds the args blob for the `_fundingSettle` instruction.
/// @dev    abi.encode keeps args readable; total 160 bytes < 255 (the program's per-instruction
///         args length is a single byte).
library FundingSettleArgsBuilder {
    function build(
        address fundingIndex,
        int256 fixedRate, // F (FFR), per-period, signed 1e18
        uint256 cap, // max |R - F| per period, 1e18 (e.g. 4e16 = 4%)
        uint256 notional, // N, USDC 1e6
        uint256 periodSeconds // demo: 120
    ) internal pure returns (bytes memory) {
        return abi.encode(fundingIndex, fixedRate, cap, notional, periodSeconds);
    }
}

/// @title FundingSettle — a SwapVM instruction for funding-rate settlement
/// @notice Settles one period of a funding-rate swap: reads the latched funding rate for the
///         period from the on-chain funding index, nets it against the position's fixed rate,
///         clamps to the per-period cap, and writes the net to `ctx.swap.amountOut` so the
///         router delivers it from the payer (maker) to the receiver (taker).
/// @dev    `period` is derived from `block.timestamp`, so the maker's program is fixed (no
///         per-period re-ship) and the taker cannot choose a favourable period. Mixed into a
///         router via `_opcodes()`.
abstract contract FundingSettle {
    using ContextLib for Context;

    uint256 internal constant RATE_ONE = 1e18;

    error FundingNotSet();

    /// @param ctx  SwapVM execution context (mutated: `ctx.swap.amountOut`).
    /// @param args abi.encode(fundingIndex, fixedRate, cap, notional, periodSeconds).
    function _fundingSettle(Context memory ctx, bytes calldata args) internal view {
        (address fundingIndex, int256 fixedRate, uint256 cap, uint256 notional, uint256 periodSeconds) =
            abi.decode(args, (address, int256, uint256, uint256, uint256));

        uint256 period = block.timestamp / periodSeconds;
        (int256 realized, bool isSet) = IFundingIndex(fundingIndex).getFundingIndex(period);
        require(isSet, FundingNotSet());

        int256 diff = _clamp(realized - fixedRate, cap); // clamp(R - F, ±cap)
        ctx.swap.amountOut = (_abs(diff) * notional) / RATE_ONE; // net delivered: maker(payer) -> taker(receiver)
    }

    function _clamp(int256 diff, uint256 cap) private pure returns (int256) {
        int256 c = int256(cap);
        if (diff > c) return c;
        if (diff < -c) return -c;
        return diff;
    }

    function _abs(int256 x) private pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }
}
