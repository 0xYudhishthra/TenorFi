// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {FundingIndex} from "../src/FundingIndex.sol";

contract FundingIndexTest is Test {
    FundingIndex internal idx;

    address internal owner = address(this);
    address internal forwarder = makeAddr("forwarder");
    address internal stranger = makeAddr("stranger");

    event FundingIndexSet(uint256 indexed period, int256 value);

    function setUp() public {
        idx = new FundingIndex(forwarder);
    }

    function test_constructor_setsOwnerAndForwarder() public view {
        assertEq(idx.owner(), owner);
        assertEq(idx.forwarder(), forwarder);
    }

    function test_setFundingIndex_byForwarder_latchesValue() public {
        vm.expectEmit(true, false, false, true);
        emit FundingIndexSet(7, 411e12);

        vm.prank(forwarder);
        idx.setFundingIndex(7, 411e12);

        (int256 value, bool set) = idx.getFundingIndex(7);
        assertEq(value, 411e12);
        assertTrue(set);
    }

    function test_setFundingIndex_supportsNegativeFunding() public {
        // Funding can go negative (Mar-2020: +0.01% -> -0.375%).
        vm.prank(forwarder);
        idx.setFundingIndex(3, -375e13);

        (int256 value, bool set) = idx.getFundingIndex(3);
        assertEq(value, -375e13);
        assertTrue(set);
    }

    function test_setFundingIndex_zeroIsLatched() public {
        // 0 is a valid funding rate and must be distinguishable from "unset".
        (, bool setBefore) = idx.getFundingIndex(9);
        assertFalse(setBefore);

        vm.prank(forwarder);
        idx.setFundingIndex(9, 0);

        (int256 value, bool set) = idx.getFundingIndex(9);
        assertEq(value, 0);
        assertTrue(set);
    }

    function test_setFundingIndex_revertsForNonForwarder() public {
        vm.prank(stranger);
        vm.expectRevert(FundingIndex.NotForwarder.selector);
        idx.setFundingIndex(1, 100e12);
    }

    function test_setFundingIndex_writeOnce() public {
        vm.prank(forwarder);
        idx.setFundingIndex(5, 100e12);

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(FundingIndex.AlreadySet.selector, uint256(5)));
        idx.setFundingIndex(5, 200e12);
    }

    function test_requireFundingIndex_revertsWhenUnset() public {
        vm.expectRevert(abi.encodeWithSelector(FundingIndex.NotSet.selector, uint256(2)));
        idx.requireFundingIndex(2);
    }

    function test_setForwarder_onlyOwnerAndRotates() public {
        address newForwarder = makeAddr("newForwarder");
        idx.setForwarder(newForwarder);
        assertEq(idx.forwarder(), newForwarder);

        // Old forwarder can no longer write.
        vm.prank(forwarder);
        vm.expectRevert(FundingIndex.NotForwarder.selector);
        idx.setFundingIndex(1, 1);

        // New forwarder can.
        vm.prank(newForwarder);
        idx.setFundingIndex(1, 42);
        (int256 v,) = idx.getFundingIndex(1);
        assertEq(v, 42);
    }

    function test_setForwarder_revertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(FundingIndex.NotOwner.selector);
        idx.setForwarder(stranger);
    }
}
