// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IStrategyAdapter.sol";
import "./interface/IComet.sol";

contract CompoundAdapter is IStrategyAdapter, Ownable, Pausable {
    using SafeERC20 for IERC20;

    address public vault;
    address public override underlyingToken;
    IComet public comet; // The cToken v3, e.g., cUSDCv3

    bool private _isActive = true;

    modifier onlyVault() {
        require(msg.sender == vault, "Only Vault");
        _;
    }

    constructor(
        address _vault,
        address _underlyingToken,
        address _comet
    ) Ownable(msg.sender) {
        require(_vault != address(0), "Invalid vault");
        require(_underlyingToken != address(0), "Invalid underlying");
        require(_comet != address(0), "Invalid comet");

        vault = _vault;
        underlyingToken = _underlyingToken;
        comet = IComet(_comet);
    }

    function deposit(uint256 amount) external override onlyVault whenNotPaused {
        require(_isActive, "Adapter not active");
        if (amount == 0) return;

        IERC20 token = IERC20(underlyingToken);

        // Transfer funds from Vault to this adapter
        token.safeTransferFrom(vault, address(this), amount);

        // Approve and supply to Compound v3
        token.safeIncreaseAllowance(address(comet), amount);
        comet.supply(underlyingToken, amount);
    }

    function withdraw(uint256 amount) external override onlyVault {
        if (amount == 0) return;

        // Withdraw from Compound
        comet.withdraw(underlyingToken, amount);

        // Transfer back to Vault
        IERC20(underlyingToken).safeTransfer(vault, amount);
    }

    function totalAssets() external view override returns (uint256) {
        // Compound v3 Comet tokens are rebasing, balanceOf(this) is the principal + interest
        return IERC20(address(comet)).balanceOf(address(this));
    }

    function harvest() external override onlyVault {
        // Compound v3 yields accrue directly to the balance.
        // For standard supply APY, no explicit harvest is needed for base asset.
        // Note: COMP rewards claim can be added later if needed.
    }

    function emergencyWithdraw() external override onlyOwner {
        // Withdraw all from Compound
        uint256 total = IERC20(address(comet)).balanceOf(address(this));
        if (total > 0) {
            comet.withdraw(underlyingToken, total);
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
