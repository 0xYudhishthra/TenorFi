// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Minimal ERC20 surface used for collateral (USDC, 6 decimals).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IFundingIndex {
    function getFundingIndex(uint256 period) external view returns (int256 value, bool set);
}

/// @title KeelSwap
/// @notice Settlement core for Keel's fixed-funding-rate swaps. Matches one hedger with
///         one speculator, custodies their pre-locked collateral, and nets the
///         fixed-vs-realized-floating difference each settlement period. The protocol
///         holds no directional position — it only matches, custodies, and settles.
///
/// @dev    Units:
///           - rates (fixedRate, cap, funding index): signed 1e18 fixed-point,
///             per-period fractional rates.
///           - notional & collateral: USDC, 6 decimals.
///           - per-period cashflow = clamp(realized - fixed, ±cap) * notional / 1e18.
///
///         Leg convention:
///           - HEDGER receives floating, pays fixed:  net = (realized - fixed) * notional.
///           - SPECULATOR is the exact opposite:       net = (fixed - realized) * notional.
///         When realized > fixed the hedger is credited and the speculator is debited;
///         when realized < fixed the flow reverses. The convention is fixed and explicit.
///
///         No-default design (three structural guarantees):
///           1. Each period's settlement magnitude is clamped to `cap * notional` — the
///              venue funding clamp — so the most anyone can owe in a period is bounded.
///           2. Each party pre-locks at least one period's max (`cap * notional`), so the
///              first period is always fully covered; settlement can never overdraw a
///              party's balance (it reverts instead of creating unbacked debt).
///           3. Settlement only *moves* collateral between the two parties — the sum
///              `hedgerCollateral + speculatorCollateral` is conserved — so a credited
///              party is always fully backed by tokens the contract actually holds and
///              can withdraw in full on close, even if the other side is drained.
contract KeelSwap {
    uint256 internal constant RATE_ONE = 1e18;

    IERC20 public immutable collateralToken;
    IFundingIndex public immutable fundingIndex;

    struct Swap {
        address hedger; // receives floating, pays fixed
        address speculator; // receives fixed, pays floating
        uint256 notional; // USDC (1e6)
        int256 fixedRate; // 1e18, signed, per period
        uint256 cap; // 1e18, max |realized - fixed| applied per period
        uint256 startPeriod; // first settleable period (inclusive)
        uint256 endPeriod; // last settleable period (inclusive)
        uint256 hedgerCollateral; // USDC (1e6) currently backing the hedger
        uint256 speculatorCollateral; // USDC (1e6) currently backing the speculator
        bool closed;
    }

    uint256 public nextSwapId;
    mapping(uint256 => Swap) public swaps;
    /// @notice swapId => period => settled (no-double-settle guard).
    mapping(uint256 => mapping(uint256 => bool)) public settled;

    event SwapOpened(
        uint256 indexed swapId,
        address indexed hedger,
        address indexed speculator,
        uint256 notional,
        int256 fixedRate,
        uint256 cap,
        uint256 startPeriod,
        uint256 endPeriod,
        uint256 hedgerCollateral,
        uint256 speculatorCollateral
    );

    /// @param amount   Magnitude of USDC moved this period (0 if realized == fixed).
    /// @param diff     Clamped (realized - fixed) applied this period (1e18, signed).
    /// @param payer    Party debited this period (address(0) if amount == 0).
    /// @param receiver Party credited this period (address(0) if amount == 0).
    event Settled(
        uint256 indexed swapId,
        uint256 indexed period,
        int256 realized,
        int256 diff,
        uint256 amount,
        address payer,
        address receiver
    );

    event SwapClosed(uint256 indexed swapId, uint256 hedgerPayout, uint256 speculatorPayout);

    error ZeroAddress();
    error SamePartySwap();
    error ZeroNotional();
    error ZeroCap();
    error BadPeriodRange();
    error InsufficientCollateral(); // posted collateral below one-period max
    error PeriodOutOfRange();
    error AlreadySettled();
    error FundingNotSet();
    error SwapClosedError();
    error NotParticipant();

    constructor(address collateralToken_, address fundingIndex_) {
        if (collateralToken_ == address(0) || fundingIndex_ == address(0)) revert ZeroAddress();
        collateralToken = IERC20(collateralToken_);
        fundingIndex = IFundingIndex(fundingIndex_);
    }

    /// @notice Open a matched swap. Pulls `hedgerCollateral` from `hedger` and
    ///         `speculatorCollateral` from `speculator` (both must have approved this
    ///         contract). Each side must post at least one period's max loss
    ///         (`cap * notional / 1e18`) so the no-default guarantee holds.
    /// @return swapId The id of the newly opened swap.
    function open(
        address hedger,
        address speculator,
        uint256 notional,
        int256 fixedRate,
        uint256 cap,
        uint256 startPeriod,
        uint256 endPeriod,
        uint256 hedgerCollateral,
        uint256 speculatorCollateral
    ) external returns (uint256 swapId) {
        if (hedger == address(0) || speculator == address(0)) {
            revert ZeroAddress();
        }
        if (hedger == speculator) revert SamePartySwap();
        if (notional == 0) revert ZeroNotional();
        if (cap == 0) revert ZeroCap();
        if (endPeriod < startPeriod) revert BadPeriodRange();

        uint256 minCollateral = maxPeriodAmount(cap, notional);
        if (hedgerCollateral < minCollateral || speculatorCollateral < minCollateral) {
            revert InsufficientCollateral();
        }

        swapId = nextSwapId++;
        swaps[swapId] = Swap({
            hedger: hedger,
            speculator: speculator,
            notional: notional,
            fixedRate: fixedRate,
            cap: cap,
            startPeriod: startPeriod,
            endPeriod: endPeriod,
            hedgerCollateral: hedgerCollateral,
            speculatorCollateral: speculatorCollateral,
            closed: false
        });

        // Pull pre-locked collateral from each party.
        _pull(hedger, hedgerCollateral);
        _pull(speculator, speculatorCollateral);

        emit SwapOpened(
            swapId,
            hedger,
            speculator,
            notional,
            fixedRate,
            cap,
            startPeriod,
            endPeriod,
            hedgerCollateral,
            speculatorCollateral
        );
    }

    /// @notice Settle a single period: read the latched funding rate, compute the
    ///         clamped net cashflow, and move it from the payer's balance to the
    ///         receiver's balance. No tokens leave the contract here — collateral is
    ///         only re-credited between the two parties and paid out on `close`.
    function settle(uint256 swapId, uint256 period) external {
        Swap storage s = swaps[swapId];
        if (s.closed) revert SwapClosedError();
        if (period < s.startPeriod || period > s.endPeriod) revert PeriodOutOfRange();
        if (settled[swapId][period]) revert AlreadySettled();

        (int256 realized, bool isSet) = fundingIndex.getFundingIndex(period);
        if (!isSet) revert FundingNotSet();

        settled[swapId][period] = true;

        int256 diff = _clamp(realized - s.fixedRate, s.cap);

        if (diff == 0) {
            emit Settled(swapId, period, realized, 0, 0, address(0), address(0));
            return;
        }

        uint256 amount = (_abs(diff) * s.notional) / RATE_ONE;
        address payer;
        address receiver;

        if (diff > 0) {
            // realized > fixed: hedger (floating receiver) is credited; speculator pays.
            if (s.speculatorCollateral < amount) revert InsufficientCollateral();
            s.speculatorCollateral -= amount;
            s.hedgerCollateral += amount;
            payer = s.speculator;
            receiver = s.hedger;
        } else {
            // realized < fixed: hedger pays the gap; speculator is credited.
            if (s.hedgerCollateral < amount) revert InsufficientCollateral();
            s.hedgerCollateral -= amount;
            s.speculatorCollateral += amount;
            payer = s.hedger;
            receiver = s.speculator;
        }

        emit Settled(swapId, period, realized, diff, amount, payer, receiver);
    }

    /// @notice Close the swap and return each party's remaining balance. Callable by
    ///         either participant. A drained side simply receives 0 while the solvent
    ///         counterparty withdraws everything credited to it — "close only their
    ///         side; the counterparty is paid in full."
    function close(uint256 swapId) external {
        Swap storage s = swaps[swapId];
        if (s.closed) revert SwapClosedError();
        if (msg.sender != s.hedger && msg.sender != s.speculator) revert NotParticipant();

        s.closed = true;
        uint256 hedgerPayout = s.hedgerCollateral;
        uint256 speculatorPayout = s.speculatorCollateral;
        s.hedgerCollateral = 0;
        s.speculatorCollateral = 0;

        if (hedgerPayout > 0) _push(s.hedger, hedgerPayout);
        if (speculatorPayout > 0) _push(s.speculator, speculatorPayout);

        emit SwapClosed(swapId, hedgerPayout, speculatorPayout);
    }

    // --- views ---

    /// @notice Max USDC that can move in a single period: `cap * notional / 1e18`.
    ///         This is the per-party pre-locked minimum and the no-default bound.
    function maxPeriodAmount(uint256 cap, uint256 notional) public pure returns (uint256) {
        return (cap * notional) / RATE_ONE;
    }

    /// @notice Preview the net cashflow for a given realized rate without settling.
    /// @return diff   The clamped (realized - fixed) that would be applied (1e18).
    /// @return amount The USDC magnitude that would move (1e6).
    function previewSettle(uint256 swapId, int256 realized)
        external
        view
        returns (int256 diff, uint256 amount)
    {
        Swap storage s = swaps[swapId];
        diff = _clamp(realized - s.fixedRate, s.cap);
        amount = (_abs(diff) * s.notional) / RATE_ONE;
    }

    // --- internal ---

    function _clamp(int256 diff, uint256 cap) internal pure returns (int256) {
        int256 c = int256(cap);
        if (diff > c) return c;
        if (diff < -c) return -c;
        return diff;
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    function _pull(address from, uint256 amount) internal {
        require(collateralToken.transferFrom(from, address(this), amount), "pull failed");
    }

    function _push(address to, uint256 amount) internal {
        require(collateralToken.transfer(to, amount), "push failed");
    }
}
