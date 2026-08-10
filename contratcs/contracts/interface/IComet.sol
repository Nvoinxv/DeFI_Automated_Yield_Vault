// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IComet {
    /// @notice Supply an amount of asset to the protocol
    /// @param asset The address of the asset to supply
    /// @param amount The amount to supply
    function supply(address asset, uint256 amount) external;

    /// @notice Withdraw an amount of asset from the protocol
    /// @param asset The address of the asset to withdraw
    /// @param amount The amount to withdraw
    function withdraw(address asset, uint256 amount) external;
}
