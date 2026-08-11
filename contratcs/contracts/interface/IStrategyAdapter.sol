// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStrategyAdapter {
    /// @notice Deposit token ke strategy
    /// @param amount Jumlah token yang akan dideposit
    function deposit(uint256 amount) external;

    /// @notice Withdraw token dari strategy
    /// @param amount Jumlah token yang akan diwithdraw
    function withdraw(uint256 amount) external;

    /// @notice Cek total aset yang dikelola strategy ini
    /// @return totalAssets Jumlah aset dalam satuan token underlying
    function totalAssets() external view returns (uint256 totalAssets);

    /// @notice Cek alamat token underlying (misal USDC, WETH, dll)
    /// @return Alamat token underlying
    function underlyingToken() external view returns (address);

    /// @notice Harvest reward dari strategy (kalau ada)
    function harvest() external;

    /// @notice Emergency withdraw semua aset ke vault
    function emergencyWithdraw() external;

    /// @notice Cek apakah strategy masih aktif
    /// @return active Status strategy
    function isActive() external view returns (bool active);
}
