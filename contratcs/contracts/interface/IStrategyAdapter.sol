pragma solidity ^0.8.27;

interface IStrategyAdapter {
    function deposit(uint256 amount) external returns (uint256);

    function withdraw(uint256 amount) external returns (uint256);

    function totalAssets() external view returns (uint256);

    function protocol() external view returns (string memory);
}
