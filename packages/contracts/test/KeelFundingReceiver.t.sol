// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {FundingIndex} from "../src/FundingIndex.sol";
import {KeelFundingReceiver} from "../src/KeelFundingReceiver.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";

contract KeelFundingReceiverTest is Test {
    FundingIndex internal idx;
    KeelFundingReceiver internal receiver;

    address internal owner = address(this);
    address internal forwarder = makeAddr("forwarder");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");

    event ReportProcessed(uint256 indexed period, int256 value, address indexed caller);
    event ReportSkipped(uint256 indexed period);

    function setUp() public {
        // Index starts with the deployer as a temporary forwarder, then is re-pointed at the
        // receiver (mirrors Deploy.s.sol wiring).
        idx = new FundingIndex(address(this));
        receiver = new KeelFundingReceiver(idx, forwarder, relayer);
        idx.setForwarder(address(receiver));
    }

    function _report(uint256 period, int256 value) internal pure returns (bytes memory) {
        return abi.encode(period, value);
    }

    function test_constructor_setsState() public view {
        assertEq(address(receiver.fundingIndex()), address(idx));
        assertEq(receiver.forwarder(), forwarder);
        assertEq(receiver.relayer(), relayer);
        assertEq(receiver.owner(), owner);
    }

    function test_constructor_revertsOnZeroForwarder() public {
        vm.expectRevert(KeelFundingReceiver.ZeroAddress.selector);
        new KeelFundingReceiver(idx, address(0), relayer);
    }

    function test_constructor_revertsOnZeroIndex() public {
        vm.expectRevert(KeelFundingReceiver.ZeroAddress.selector);
        new KeelFundingReceiver(FundingIndex(address(0)), forwarder, relayer);
    }

    function test_onReport_byForwarder_latches() public {
        vm.expectEmit(true, true, false, true);
        emit ReportProcessed(7, 411e12, forwarder);

        vm.prank(forwarder);
        receiver.onReport("", _report(7, 411e12));

        (int256 value, bool set) = idx.getFundingIndex(7);
        assertEq(value, 411e12);
        assertTrue(set);
    }

    function test_onReport_byRelayer_latches() public {
        vm.prank(relayer);
        receiver.onReport("", _report(8, 123e12));

        (int256 value, bool set) = idx.getFundingIndex(8);
        assertEq(value, 123e12);
        assertTrue(set);
    }

    function test_onReport_supportsNegativeFunding() public {
        vm.prank(forwarder);
        receiver.onReport("", _report(3, -375e13));

        (int256 value,) = idx.getFundingIndex(3);
        assertEq(value, -375e13);
    }

    function test_onReport_revertsForUnauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(KeelFundingReceiver.NotAuthorized.selector);
        receiver.onReport("", _report(1, 100e12));
    }

    function test_onReport_duplicatePeriod_isNoOp() public {
        vm.prank(forwarder);
        receiver.onReport("", _report(5, 100e12));

        // A second delivery for the same period must not revert and must not overwrite.
        vm.expectEmit(true, false, false, false);
        emit ReportSkipped(5);

        vm.prank(forwarder);
        receiver.onReport("", _report(5, 200e12));

        (int256 value,) = idx.getFundingIndex(5);
        assertEq(value, 100e12);
    }

    function test_setRelayer_onlyOwnerAndRotates() public {
        address newRelayer = makeAddr("newRelayer");
        receiver.setRelayer(newRelayer);
        assertEq(receiver.relayer(), newRelayer);

        // Old relayer can no longer write.
        vm.prank(relayer);
        vm.expectRevert(KeelFundingReceiver.NotAuthorized.selector);
        receiver.onReport("", _report(2, 1));

        // New relayer can.
        vm.prank(newRelayer);
        receiver.onReport("", _report(2, 42));
        (int256 v,) = idx.getFundingIndex(2);
        assertEq(v, 42);
    }

    function test_setRelayer_revertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(KeelFundingReceiver.NotOwner.selector);
        receiver.setRelayer(stranger);
    }

    function test_setOwner_rotates() public {
        address newOwner = makeAddr("newOwner");
        receiver.setOwner(newOwner);
        assertEq(receiver.owner(), newOwner);

        vm.expectRevert(KeelFundingReceiver.NotOwner.selector);
        receiver.setRelayer(stranger);
    }

    function test_supportsInterface() public view {
        assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(receiver.supportsInterface(type(IERC165).interfaceId));
        assertFalse(receiver.supportsInterface(0xffffffff));
    }
}
