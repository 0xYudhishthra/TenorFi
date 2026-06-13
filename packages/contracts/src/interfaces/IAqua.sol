// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IAqua
/// @notice Minimal interface to the 1inch Aqua shared-liquidity layer
///         (https://github.com/1inch/aqua, src/Aqua.sol). Aqua holds per-maker virtual
///         balances ("allowances") that an app can `pull` from the maker's wallet — so
///         collateral stays live in the wallet and only moves at settlement.
/// @dev    Signatures mirror the deployed Aqua contract so this binds to it directly
///         (deploy Aqua locally for tests, or fork a chain where it lives).
interface IAqua {
    /// @notice Maker registers a strategy with an app and sets initial virtual balances.
    /// @dev    `strategyHash = keccak256(strategy)`. msg.sender is the maker.
    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external returns (bytes32 strategyHash);

    /// @notice App pulls `amount` of `token` from `maker`'s balance and transfers it to `to`.
    /// @dev    msg.sender MUST be the app the strategy was shipped to. Decrements the
    ///         maker's virtual balance and does transferFrom(maker -> to).
    function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external;

    /// @notice Pushes `amount` of `token` into a maker's app balance (transferFrom caller -> maker).
    function push(address maker, address app, bytes32 strategyHash, address token, uint256 amount) external;

    /// @notice Maker deactivates a strategy, clearing balances for all its tokens.
    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;

    /// @notice Raw virtual balance for (maker, app, strategyHash, token).
    function rawBalances(address maker, address app, bytes32 strategyHash, address token)
        external
        view
        returns (uint248 balance, uint8 tokensCount);
}
