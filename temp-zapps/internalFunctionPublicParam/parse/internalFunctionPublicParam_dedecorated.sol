// SPDX-License-Identifier: CC0

pragma solidity ^0.8.0;

contract Assign {

uint256 private a;
uint256 private b;

function addB(uint256 value) public {
b += 2;
addA(value);

}

function addA( uint256 value) public {
a = a + 2 * value;

}
}