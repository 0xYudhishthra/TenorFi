// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IReceiver} from "./interfaces/IReceiver.sol";
import {FundingIndex} from "./FundingIndex.sol";

/// @title KeelFundingReceiver
/// @notice Canonical Chainlink CRE consumer for the funding oracle. The DON-signed report is
///         delivered by the KeystoneForwarder via `onReport`; this contract decodes the
///         `(period, value)` pair and latches it into `FundingIndex`. It is wired in as the
///         `FundingIndex.forwarder`, so it is the only address allowed to write the index.
/// @dev    A standing EOA `relayer` may also call `onReport` directly as the live-demo fallback
///         when the DON is flaky — it submits the same `(period, value)` encoding.
contract KeelFundingReceiver is IReceiver {
    /// @notice The funding-index latch this receiver writes to.
    FundingIndex public immutable fundingIndex;

    /// @notice The CRE KeystoneForwarder authorized to deliver DON reports.
    address public immutable forwarder;

    /// @notice Owner that can rotate the relayer fallback address.
    address public owner;

    /// @notice Optional EOA fallback allowed to post reports when the DON is unavailable.
    address public relayer;

    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);
    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event ReportProcessed(uint256 indexed period, int256 value, address indexed caller);
    event ReportSkipped(uint256 indexed period);

    error NotAuthorized();
    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param fundingIndex_ The funding-index latch to write to.
    /// @param forwarder_    The CRE KeystoneForwarder address.
    /// @param relayer_      The EOA fallback (may be the zero address to disable the fallback).
    constructor(FundingIndex fundingIndex_, address forwarder_, address relayer_) {
        if (address(fundingIndex_) == address(0) || forwarder_ == address(0)) revert ZeroAddress();
        fundingIndex = fundingIndex_;
        forwarder = forwarder_;
        owner = msg.sender;
        relayer = relayer_;
        emit OwnerUpdated(address(0), msg.sender);
        emit RelayerUpdated(address(0), relayer_);
    }

    /// @notice Rotate the EOA fallback (set to the zero address to disable it).
    function setRelayer(address newRelayer) external onlyOwner {
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    /// @notice Transfer ownership.
    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    /// @inheritdoc IReceiver
    /// @dev `report` is `abi.encode(uint256 period, int256 value)` — kept in lockstep with the
    ///      CRE workflow's report encoder. The write is idempotent: a period that is already
    ///      latched is skipped (rather than reverting) so a duplicate DON delivery can't brick
    ///      the forwarder.
    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != forwarder && msg.sender != relayer) revert NotAuthorized();

        (uint256 period, int256 value) = abi.decode(report, (uint256, int256));

        if (fundingIndex.isSet(period)) {
            emit ReportSkipped(period);
            return;
        }

        fundingIndex.setFundingIndex(period, value);
        emit ReportProcessed(period, value, msg.sender);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
