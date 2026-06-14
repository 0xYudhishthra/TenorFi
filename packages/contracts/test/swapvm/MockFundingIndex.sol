// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Test double for the on-chain funding index CRE writes to.
contract MockFundingIndex {
    mapping(uint256 => int256) private _value;
    mapping(uint256 => bool) private _set;

    function setFundingIndex(uint256 period, int256 value) external {
        _value[period] = value;
        _set[period] = true;
    }

    function getFundingIndex(uint256 period) external view returns (int256 value, bool set) {
        return (_value[period], _set[period]);
    }
}
