// SPDX-License-Identifier: CC0

pragma solidity ^0.8.0;

contract Assign {

uint256 private a;
uint256 public b;
bool public isTerminated;
function add(uint256 value) public {
require(isTerminated == false );
a += value;
}

function remove(uint256 value) public {
a -= value;
}
function addPublic( uint256 value) public {
b = 2 * value;
}

function terminateContract() public {
isTerminated = true;
}

}