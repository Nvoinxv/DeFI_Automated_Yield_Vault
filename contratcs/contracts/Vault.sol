// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IStrategyAdapter.sol";

contract Vault is ERC4626, Ownable {
    IStrategyAdapter[] public adapters;
    uint256 public rebalanceThreshold = 150; // 1.5% = 150 basis points

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_
    ) ERC4626(asset_) ERC20(name_, symbol_) Ownable(msg.sender) {}

    function addAdapter(IStrategyAdapter adapter) external onlyOwner {
        adapters.push(adapter);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 total = super.totalAssets();
        for (uint256 i = 0; i < adapters.length; i++) {
            total += adapters[i].totalAssets();
        }
        return total;
    }

    function rebalance() external onlyOwner {
        // Logic rebalance akan ditambahkan di Sprint 2
    }
}
