import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("YieldVaultModule", (m) => {
    // 1. Deploy MockERC20
    const mockERC20 = m.contract("MockERC20", ["Mock USDC", "mUSDC"]);

    // 2. Deploy Vault
    const vault = m.contract("Vault", [
        mockERC20,
        "DeFi Yield Vault",
        "dYV"
    ]);

    const dummyAToken = "0x0000000000000000000000000000000000000001";
    const dummyAavePool = "0x0000000000000000000000000000000000000002";
    const dummyComet = "0x0000000000000000000000000000000000000003";

    // 3. Deploy Adapters
    const aaveAdapter = m.contract("AaveAdapter", [
        vault,
        mockERC20,
        dummyAToken,
        dummyAavePool
    ]);

    const compoundAdapter = m.contract("CompoundAdapter", [
        vault,
        mockERC20,
        dummyComet
    ]);

    // 4. Setup adapters
    m.call(vault, "addAdapter", [aaveAdapter], { id: "addAave" });
    m.call(vault, "addAdapter", [compoundAdapter], { id: "addCompound" });

    return { mockERC20, vault, aaveAdapter, compoundAdapter };
});
