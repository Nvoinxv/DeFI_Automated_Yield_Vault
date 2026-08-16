// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IStrategyAdapter.sol";
import "./interface/IAavePool.sol";

contract AaveAdapter is IStrategyAdapter, Ownable, Pausable {
    using SafeERC20 for IERC20;

    address public vault;
    address public override underlyingToken;
    address public aToken;
    IAavePool public aavePool;

    bool private _isActive = true;

    modifier onlyVault() {
        require(msg.sender == vault, "Only Vault");
        _;
    }

    constructor(
        address _vault,
        address _underlyingToken,
        address _aToken,
        address _aavePool
    ) Ownable(msg.sender) {
        require(_vault != address(0), "Invalid vault");
        require(_underlyingToken != address(0), "Invalid underlying");
        require(_aToken != address(0), "Invalid aToken");
        require(_aavePool != address(0), "Invalid pool");

        vault = _vault;
        underlyingToken = _underlyingToken;
        aToken = _aToken;
        aavePool = IAavePool(_aavePool);
    }

    function deposit(uint256 amount) external override onlyVault whenNotPaused {
        require(_isActive, "Adapter not active");
        if (amount == 0) return;

        IERC20 token = IERC20(underlyingToken);

        // Transfer funds from Vault to this adapter
        token.safeTransferFrom(vault, address(this), amount);

        // Approve and supply to Aave
        token.safeIncreaseAllowance(address(aavePool), amount);
        aavePool.supply(underlyingToken, amount, address(this), 0);
    }

    function withdraw(uint256 amount) external override onlyVault {
        if (amount == 0) return;

        // Withdraw from Aave
        aavePool.withdraw(underlyingToken, amount, address(this));

        // Transfer back to Vault
        IERC20(underlyingToken).safeTransfer(vault, amount);
    }

    function totalAssets() external view override returns (uint256) {
        return IERC20(aToken).balanceOf(address(this));
    }

    function harvest() external override onlyVault {
        // Aave v3 automatically compounds interest into the aToken balance.
        // No explicit harvest logic required for standard supply.
    }

    function emergencyWithdraw() external override onlyOwner {
        // Withdraw all from Aave
        uint256 total = IERC20(aToken).balanceOf(address(this));
        if (total > 0) {
            aavePool.withdraw(
                underlyingToken,
                type(uint256).max,
                address(this)
            );
        }

        // Send all underlying tokens to Vault
        IERC20 token = IERC20(underlyingToken);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.safeTransfer(vault, balance);
        }
    }

    function isActive() external view override returns (bool) {
        return _isActive && !paused();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setActive(bool active) external onlyOwner {
        _isActive = active;
    }
}
