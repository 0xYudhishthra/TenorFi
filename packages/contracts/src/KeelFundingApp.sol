// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAqua} from "./interfaces/IAqua.sol";

interface IFundingIndex {
    function getFundingIndex(uint256 period) external view returns (int256 value, bool set);
}

/// @title KeelFundingApp
/// @notice Funding-rate swap backed by Aqua virtual balances: collateral stays live in each
///         party's wallet, and each period's net cashflow is moved with a single Aqua `pull`
///         — a one-token balance transfer between the two parties, not a tokenIn/tokenOut swap.
///
/// @dev    Lifecycle:
///           1. Each party `ship`s a USDC strategy to THIS app (collateral = a virtual
///              balance / allowance; tokens stay in their wallet). The hedger and the LP
///              each ship with `Strategy{maker, role, salt}` so the hashes are recomputable.
///           2. `open(...)` pairs the two strategies + records terms (verifies each side
///              pre-locked >= one period's max = cap*notional, the no-default bound).
///           3. `settle(swapId, period)` reads the latched funding rate and `pull`s the
///              netted difference from payer -> receiver. No double-settle.
///           4. `close()` lets each maker `dock` their strategy (off-chain / by the maker).
///
///         Leg convention:
///           hedger net = (realized - fixed) * notional.  realized > fixed => hedger
///           receives (LP pays); realized < fixed => hedger pays (LP receives). "realized"
///           is the actual funding rate (AFR); "fixed" is the locked rate (FFR).
contract KeelFundingApp {
    uint256 internal constant RATE_ONE = 1e18;

    IAqua public immutable AQUA;
    IFundingIndex public immutable fundingIndex;
    address public immutable usdc;

    enum Role {
        Hedger,
        Lp
    }

    /// @dev Must be ABI-encoded and `ship`ped EXACTLY like this so the hash matches.
    struct Strategy {
        address maker;
        Role role;
        bytes32 salt;
    }

    struct Swap {
        address hedger; // receives floating, pays fixed
        bytes32 hedgerStrategy;
        address lp; // counterparty (receives fixed, pays floating)
        bytes32 lpStrategy;
        uint256 notional; // USDC (1e6)
        int256 fixedRate; // 1e18, signed, per period (FFR)
        uint256 cap; // 1e18, max |realized - fixed| per period
        uint256 startPeriod;
        uint256 endPeriod;
        bool closed;
    }

    uint256 public nextSwapId;
    mapping(uint256 => Swap) public swaps;
    mapping(uint256 => mapping(uint256 => bool)) public settled;

    uint256 private _lock = 1; // cheap non-reentrancy guard

    event SwapOpened(
        uint256 indexed swapId, address indexed hedger, address indexed lp, uint256 notional, int256 fixedRate, uint256 cap
    );
    event Settled(
        uint256 indexed swapId, uint256 indexed period, int256 realized, int256 diff, uint256 amount, address payer, address receiver
    );
    event SwapClosed(uint256 indexed swapId);

    error Reentrancy();
    error SamePartySwap();
    error ZeroNotional();
    error ZeroCap();
    error BadPeriodRange();
    error InsufficientCollateral();
    error PeriodOutOfRange();
    error AlreadySettled();
    error FundingNotSet();
    error SwapClosedError();
    error NotParticipant();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address aqua_, address fundingIndex_, address usdc_) {
        AQUA = IAqua(aqua_);
        fundingIndex = IFundingIndex(fundingIndex_);
        usdc = usdc_;
    }

    /// @notice Max USDC that can move in one period (= per-party pre-locked minimum).
    function maxPeriodAmount(uint256 cap, uint256 notional) public pure returns (uint256) {
        return (cap * notional) / RATE_ONE;
    }

    function strategyHash(Strategy calldata s) public pure returns (bytes32) {
        return keccak256(abi.encode(s));
    }

    /// @notice Pair two already-shipped Aqua strategies into a swap. Anyone may call;
    ///         the strategies and their balances are the source of truth.
    function open(
        Strategy calldata hedgerStrat,
        Strategy calldata lpStrat,
        uint256 notional,
        int256 fixedRate,
        uint256 cap,
        uint256 startPeriod,
        uint256 endPeriod
    ) external returns (uint256 swapId) {
        if (hedgerStrat.maker == lpStrat.maker) revert SamePartySwap();
        if (notional == 0) revert ZeroNotional();
        if (cap == 0) revert ZeroCap();
        if (endPeriod < startPeriod) revert BadPeriodRange();

        bytes32 hHash = strategyHash(hedgerStrat);
        bytes32 lHash = strategyHash(lpStrat);

        // No-default bound: each side must have pre-locked >= one period's max loss.
        uint256 minCollateral = maxPeriodAmount(cap, notional);
        (uint248 hBal,) = AQUA.rawBalances(hedgerStrat.maker, address(this), hHash, usdc);
        (uint248 lBal,) = AQUA.rawBalances(lpStrat.maker, address(this), lHash, usdc);
        if (hBal < minCollateral || lBal < minCollateral) revert InsufficientCollateral();

        swapId = nextSwapId++;
        swaps[swapId] = Swap({
            hedger: hedgerStrat.maker,
            hedgerStrategy: hHash,
            lp: lpStrat.maker,
            lpStrategy: lHash,
            notional: notional,
            fixedRate: fixedRate,
            cap: cap,
            startPeriod: startPeriod,
            endPeriod: endPeriod,
            closed: false
        });

        emit SwapOpened(swapId, hedgerStrat.maker, lpStrat.maker, notional, fixedRate, cap);
    }

    /// @notice Settle one period: read the latched funding rate (AFR), compute the clamped
    ///         net vs the fixed rate (FFR), and `pull` the difference from payer -> receiver.
    function settle(uint256 swapId, uint256 period) external nonReentrant {
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

        if (diff > 0) {
            // realized > fixed (AFR > FFR): hedger receives, LP pays.
            AQUA.pull(s.lp, s.lpStrategy, usdc, amount, s.hedger);
            emit Settled(swapId, period, realized, diff, amount, s.lp, s.hedger);
        } else {
            // realized < fixed (AFR < FFR): hedger pays the premium, LP receives.
            AQUA.pull(s.hedger, s.hedgerStrategy, usdc, amount, s.lp);
            emit Settled(swapId, period, realized, diff, amount, s.hedger, s.lp);
        }
    }

    /// @notice Mark the swap closed. Each maker `dock`s their own Aqua strategy separately
    ///         (dock is maker-authenticated on Aqua), reclaiming any remaining balance.
    function close(uint256 swapId) external {
        Swap storage s = swaps[swapId];
        if (s.closed) revert SwapClosedError();
        if (msg.sender != s.hedger && msg.sender != s.lp) revert NotParticipant();
        s.closed = true;
        emit SwapClosed(swapId);
    }

    function _clamp(int256 diff, uint256 cap) internal pure returns (int256) {
        int256 c = int256(cap);
        if (diff > c) return c;
        if (diff < -c) return -c;
        return diff;
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }
}
