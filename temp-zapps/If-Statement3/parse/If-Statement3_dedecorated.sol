// SPDX-License-Identifier: CC0

pragma solidity ^0.8.0;

contract Test {

uint256 private z;
uint256 public a;
uint256 public b;

function add(uint256 y) public {
if (y > 5 || y<1) {
z = y + 3;
} 
if(y < 3) {
z = y;
}
if (a > 5) {
b += y;
}
}

}