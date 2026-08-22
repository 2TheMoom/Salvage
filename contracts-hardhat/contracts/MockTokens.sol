// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public decimals = 18;
    mapping(address => uint256) public balanceOf;

    // Real indexers (Alchemy, Etherscan, etc.) discover ERC-20 holdings by
    // scanning Transfer logs, not by reading state directly — without this,
    // mint()/transfer() are invisible to any live-chain balance discovery,
    // even though the on-chain balance itself is correct.
    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
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
        emit Transfer(msg.sender, sink, tax);
        emit Transfer(msg.sender, to, amount - tax);
        return true;
    }
}

/// @notice Simulates a real contract holding stranded tokens with an
/// owner-gated rescue function (the `rescueERC20(token, to, amount)` shape
/// the scanner's triage looks for). Used to test that raw calldata built the
/// same way the app's owner panel builds it actually executes correctly
/// on-chain — not just that encoding it client-side doesn't throw.
contract MockStrandedVault {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function rescueERC20(address token, address to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        MockERC20(token).transfer(to, amount);
    }
}