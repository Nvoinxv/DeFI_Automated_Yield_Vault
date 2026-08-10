import hre from "hardhat";

async function main() {
    console.log("🚀 Mulai proses deployment...");

    const publicClient = await hre.viem.getPublicClient();
    const [deployer] = await hre.viem.getWalletClients();

    console.log(`👤 Deployer Account: ${deployer.account.address}`);
    
    // 1. Deploy MockERC20 (Underlying Token)
    console.log("\n📦 Deploying MockERC20 (mUSDC)...");
    const mockERC20 = await hre.viem.deployContract("MockERC20", ["Mock USDC", "mUSDC"]);
    console.log(`✅ MockERC20 deployed to: ${mockERC20.address}`);

    // 2. Deploy Vault
    console.log("\n🏦 Deploying Vault...");
    const vault = await hre.viem.deployContract("Vault", [
        mockERC20.address,
        "DeFi Yield Vault",
        "dYV"
    ]);
    console.log(`✅ Vault deployed to: ${vault.address}`);

    // Menggunakan dummy address sementara untuk pool/token Aave dan Compound.
    // Nanti jika mau integrasi dengan mainnet fork / sepolia asli,
    // kita perlu mencari address asli dari protokol tersebut.
    const dummyAToken = "0x0000000000000000000000000000000000000001";
    const dummyAavePool = "0x0000000000000000000000000000000000000002";
    const dummyComet = "0x0000000000000000000000000000000000000003";

    // 3. Deploy AaveAdapter
    console.log("\n🔌 Deploying AaveAdapter...");
    const aaveAdapter = await hre.viem.deployContract("AaveAdapter", [
        vault.address,
        mockERC20.address,
        dummyAToken,
        dummyAavePool
    ]);
    console.log(`✅ AaveAdapter deployed to: ${aaveAdapter.address}`);

    // 4. Deploy CompoundAdapter
    console.log("\n🔌 Deploying CompoundAdapter...");
    const compoundAdapter = await hre.viem.deployContract("CompoundAdapter", [
        vault.address,
        mockERC20.address,
        dummyComet
    ]);
    console.log(`✅ CompoundAdapter deployed to: ${compoundAdapter.address}`);

    // 5. Setup adapters on Vault
    console.log("\n⚙️ Menambahkan adapters ke dalam Vault...");
    await vault.write.addAdapter([aaveAdapter.address]);
    console.log(`✅ AaveAdapter terhubung ke Vault`);
    await vault.write.addAdapter([compoundAdapter.address]);
    console.log(`✅ CompoundAdapter terhubung ke Vault`);

    console.log("\n🎉 Deployment Berhasil Selesai!");
}

main().catch((error) => {
    console.error("❌ Error during deployment:", error);
    process.exitCode = 1;
});
