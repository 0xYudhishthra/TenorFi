// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Context, ContextLib} from "@1inch/swap-vm/src/libs/VM.sol";

interface IFundingIndex {
    function getFundingIndex(uint256 period) external view returns (int256 value, bool set);
}

/// @notice Builds the args blob for the `_fundingSettle` subscription instruction.
/// @dev    abi.encode keeps args readable; 7 words < the 255-byte per-instruction args limit.
library FundingSettleArgsBuilder {
    function build(
        address fundingIndex,
        int256 fixedRate, // F (FFR), per-period, signed 1e18
        uint256 cap, // max |R - F| per period, 1e18
        uint256 notional, // N, USDC 1e6
        uint256 periodSeconds, // demo: 60 (per-minute)
        address subscriber, // the only address allowed to settle this subscription (the taker)
        address settlementToken // USDC — the token premium is pulled in / coverage is paid out
    ) internal pure returns (bytes memory) {
        return abi.encode(
            fundingIndex, fixedRate, cap, notional, periodSeconds, subscriber, settlementToken
        );
    }
}

/// @title FundingSettle — a SwapVM instruction for the TenorFi funding subscription
/// @notice Settles one period of a funding-rate subscription as a SINGLE order, both directions, with
///         **zero subscriber collateral**:
///           - `R > F` (funding above the fixed rate): the reserve (maker) **covers** the gap — the
///             opcode sets `amountOut = (R − F) × N`, paid from the reserve's shipped Aqua balance to
///             the subscriber (taker). The subscriber posts nothing.
///           - `R < F` (funding below the fixed rate): the subscriber **pays the premium** — the opcode
///             sets `amountIn = (F − R) × N`, which SwapVM pulls **from the subscriber's wallet**
///             (`transferFrom`) just-in-time. Nothing is pre-locked.
///         The per-period move is clamped to `±cap × N`. Economically the net per period is identical
///         to a fixed-vs-floating swap; only the collection differs (premium from the wallet, not from
///         pre-shipped collateral).
/// @dev    A single order serves both directions because `MakerTraits.validate` only requires
///         `amountIn > 0 || allowZeroAmountIn` — coverage uses `amountOut` (amountIn 0), premium uses
///         `amountIn`. The order is bound to one `subscriber` (`taker = msg.sender`), so no one else can
///         settle it; `period = block.timestamp / periodSeconds`; each (order, period) settles once.
abstract contract FundingSettle {
    using ContextLib for Context;

    uint256 internal constant RATE_ONE = 1e18;

    /// @notice orderHash => period => settled. Prevents settling the same period twice.
    mapping(bytes32 => mapping(uint256 => bool)) public settled;

    error FundingNotSet();
    error AlreadySettled();
    error UnauthorizedTaker();
    error WrongToken();

    function _fundingSettle(Context memory ctx, bytes calldata args) internal {
        (
            address fundingIndex,
            int256 fixedRate,
            uint256 cap,
            uint256 notional,
            uint256 periodSeconds,
            address subscriber,
            address settlementToken
        ) = abi.decode(args, (address, int256, uint256, uint256, uint256, address, address));

        // Bind the subscription to its subscriber: only they may settle it.
        if (ctx.query.taker != subscriber) revert UnauthorizedTaker();

        uint256 period = block.timestamp / periodSeconds;
        (int256 realized, bool isSet) = IFundingIndex(fundingIndex).getFundingIndex(period);
        require(isSet, FundingNotSet());

        // No double-settle. Skipped during static quoting (cannot SSTORE in a staticcall).
        if (!ctx.vm.isStaticContext) {
            if (settled[ctx.query.orderHash][period]) revert AlreadySettled();
            settled[ctx.query.orderHash][period] = true;
        }

        int256 diff = _clamp(realized - fixedRate, cap); // clamp(R - F, ±cap)
        int256 amt = (diff * int256(notional)) / int256(RATE_ONE); // signed net, USDC 1e6

        if (amt > 0) {
            // R > F: reserve covers the funding → pays the subscriber from its shipped balance.
            if (ctx.query.tokenOut != settlementToken) revert WrongToken();
            ctx.swap.amountOut = uint256(amt);
        } else if (amt < 0) {
            // R < F: pull the premium from the subscriber's wallet (taker amountIn) → reserve.
            if (ctx.query.tokenIn != settlementToken) revert WrongToken();
            ctx.swap.amountIn = uint256(-amt);
            // SwapVM requires the taker to receive a non-zero `amountOut`; hand back a 1-wei
            // position-marker receipt (the subscriber posts no real collateral either way).
            ctx.swap.amountOut = 1;
        }
        // amt == 0: nothing moves this period.
    }

    function _clamp(int256 diff, uint256 cap) private pure returns (int256) {
        int256 c = int256(cap);
        if (diff > c) return c;
        if (diff < -c) return -c;
        return diff;
    }
}
