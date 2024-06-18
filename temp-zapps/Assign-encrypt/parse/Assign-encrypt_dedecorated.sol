// SPDX-License-Identifier: CC0

pragma solidity ^0.8.0;

contract Assign {

uint256 private a;
uint256 private b;

function add(uint256 value) public {
b += 2 * value;
}

function remove(uint256 value) public {
a += value;
add(value);
}
}
