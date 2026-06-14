// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Context, ContextLib} from "@1inch/swap-vm/src/libs/VM.sol";

interface IFundingIndex {
    function getFundingIndex(uint256 period) external view returns (int256 value, bool set);
}

/// @notice Builds the args blob for the `_fundingSettle` instruction.
/// @dev    abi.encode keeps args readable; total 224 bytes < 255 (the program's per-instruction
///         args length is a single byte).
library FundingSettleArgsBuilder {
    function build(
        address fundingIndex,
        int256 fixedRate, // F (FFR), per-period, signed 1e18
        uint256 cap, // max |R - F| per period, 1e18 (e.g. 4e16 = 4%)
        uint256 notional, // N, USDC 1e6
        uint256 periodSeconds, // demo: 120
        address counterparty, // the only address allowed to take this order (the receiver)
        bool makerPaysAbove // true: maker pays when realized > fixed; false: when realized < fixed
    ) internal pure returns (bytes memory) {
        return abi.encode(
            fundingIndex, fixedRate, cap, notional, periodSeconds, counterparty, makerPaysAbove
        );
    }
}

/// @title FundingSettle — a SwapVM instruction for funding-rate settlement
/// @notice Settles one period of one leg of a funding-rate swap: reads the latched funding rate,
///         nets it against the fixed rate, clamps to the per-period cap, and writes the maker's
///         payment to `ctx.swap.amountOut` so the router delivers it from the maker (payer) to the
///         taker (receiver).
/// @dev    A funding swap is two-sided but SwapVM is one-directional (maker → taker), so each Keel
///         position is **two orders**: one where the maker (LP) pays the hedger when `realized >
///         fixed` (`makerPaysAbove = true`), and a mirror where the maker (hedger) pays the LP when
///         `realized < fixed` (`makerPaysAbove = false`). Each order pays 0 outside its own
///         direction, so a maker is never debited the wrong way. The order is bound to a single
///         `counterparty` (the taker), so a third party cannot intercept the payment. `period` is
///         derived from `block.timestamp`; each (order, period) settles at most once.
abstract contract FundingSettle {
    using ContextLib for Context;

    uint256 internal constant RATE_ONE = 1e18;

    /// @notice orderHash => period => settled. Prevents settling the same period twice.
    mapping(bytes32 => mapping(uint256 => bool)) public settled;

    error FundingNotSet();
    error AlreadySettled();
    error UnauthorizedTaker();

    function _fundingSettle(Context memory ctx, bytes calldata args) internal {
        (
            address fundingIndex,
            int256 fixedRate,
            uint256 cap,
            uint256 notional,
            uint256 periodSeconds,
            address counterparty,
            bool makerPaysAbove
        ) = abi.decode(args, (address, int256, uint256, uint256, uint256, address, bool));

        // Bind the order to the agreed counterparty: only they may take it (no payment theft).
        if (ctx.query.taker != counterparty) revert UnauthorizedTaker();

        uint256 period = block.timestamp / periodSeconds;
        (int256 realized, bool isSet) = IFundingIndex(fundingIndex).getFundingIndex(period);
        require(isSet, FundingNotSet());

        // No double-settle. Skipped during static quoting (cannot SSTORE in a staticcall).
        if (!ctx.vm.isStaticContext) {
            if (settled[ctx.query.orderHash][period]) revert AlreadySettled();
            settled[ctx.query.orderHash][period] = true;
        }

        int256 diff = _clamp(realized - fixedRate, cap); // clamp(R - F, ±cap)
        // This order only pays in its own direction; 0 otherwise (the mirror order pays the other leg).
        int256 owed =
            makerPaysAbove ? (diff > 0 ? diff : int256(0)) : (diff < 0 ? -diff : int256(0));
        ctx.swap.amountOut = (uint256(owed) * notional) / RATE_ONE; // maker(payer) -> taker(receiver)
    }

    function _clamp(int256 diff, uint256 cap) private pure returns (int256) {
        int256 c = int256(cap);
        if (diff > c) return c;
        if (diff < -c) return -c;
        return diff;
    }
}
