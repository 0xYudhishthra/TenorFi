// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title FundingIndex
/// @notice On-chain latch for the realized perpetual funding rate of each settlement
///         period. A Chainlink CRE workflow reads the venue's funding rate (e.g.
///         Hyperliquid BTC hourly funding), reaches DON consensus, and writes it here
///         through the KeystoneForwarder. Settlement contracts read these values.
/// @dev    Rates are signed 1e18 fixed-point per-period fractional rates — funding can
///         and does go negative (Mar-2020: +0.01% -> -0.375% in days). Each period is
///         write-once: a period's realized funding must be immutable once it has been
///         used to settle real cashflow.
contract FundingIndex {
    /// @notice The CRE KeystoneForwarder authorized to write funding values.
    address public forwarder;

    /// @notice Owner that can rotate the forwarder address.
    address public owner;

    /// @dev period => realized funding rate (1e18, signed).
    mapping(uint256 => int256) private _value;

    /// @notice period => whether a value has been latched (0 is a valid funding rate).
    mapping(uint256 => bool) public isSet;

    event ForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event FundingIndexSet(uint256 indexed period, int256 value);

    error NotForwarder();
    error NotOwner();
    error ZeroAddress();
    error AlreadySet(uint256 period);
    error NotSet(uint256 period);

    modifier onlyForwarder() {
        if (msg.sender != forwarder) revert NotForwarder();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param forwarder_ The CRE KeystoneForwarder (may be set later via setForwarder).
    constructor(address forwarder_) {
        owner = msg.sender;
        forwarder = forwarder_;
        emit OwnerUpdated(address(0), msg.sender);
        emit ForwarderUpdated(address(0), forwarder_);
    }

    /// @notice Rotate the authorized forwarder (e.g. when the CRE workflow is redeployed).
    function setForwarder(address newForwarder) external onlyOwner {
        emit ForwarderUpdated(forwarder, newForwarder);
        forwarder = newForwarder;
    }

    /// @notice Transfer ownership.
    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Latch the realized funding rate for `period`. Write-once.
    /// @param period The settlement period index (e.g. hour number).
    /// @param value  The realized funding rate for that period (1e18, signed).
    function setFundingIndex(uint256 period, int256 value) external onlyForwarder {
        if (isSet[period]) revert AlreadySet(period);
        _value[period] = value;
        isSet[period] = true;
        emit FundingIndexSet(period, value);
    }

    /// @notice Read the latched funding rate for `period`.
    /// @return value The realized funding rate (1e18, signed); 0 if unset.
    /// @return set   Whether a value has been latched for this period.
    function getFundingIndex(uint256 period) external view returns (int256 value, bool set) {
        return (_value[period], isSet[period]);
    }

    /// @notice Revert-on-unset reader for consumers that require a settled value.
    function requireFundingIndex(uint256 period) external view returns (int256 value) {
        if (!isSet[period]) revert NotSet(period);
        return _value[period];
    }
}
