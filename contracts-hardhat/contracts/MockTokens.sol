// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public decimals = 18;
    mapping(address => uint256) public balanceOf;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Fee-on-transfer mock: skims 5% to a sink on every transfer,
/// simulating tax tokens for balance-delta accounting tests.
contract MockTaxERC20 is MockERC20 {
    address public immutable sink;

    constructor(address _sink) MockERC20("Tax Token", "TAX") {
        sink = _sink;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        uint256 tax = (amount * 500) / 10_000;
        balanceOf[msg.sender] -= amount;
        balanceOf[sink] += tax;
        balanceOf[to]   += amount - tax;
        return true;
    }
}