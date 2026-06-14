// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title IReceiver
/// @notice Chainlink CRE consumer interface. The KeystoneForwarder delivers a DON-signed
///         report by calling `onReport` on a contract that implements this interface and
///         advertises it via ERC-165.
interface IReceiver is IERC165 {
    /// @param metadata Workflow context appended by the forwarder (workflow id/owner/name etc.).
    /// @param report   The DON-agreed payload produced by the CRE workflow.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
