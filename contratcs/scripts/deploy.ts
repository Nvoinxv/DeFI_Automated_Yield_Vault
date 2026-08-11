import { network } from "hardhat";

// Cek apakah environment variable berhasil dibaca
console.log(
    "Sepolia URL tersedia:",
    !!process.env.SEPOLIA_URL
);

console.log(
    "Private Key tersedia:",
    !!process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA
);

async function main() {
    console.log("🚀 Mulai proses deployment...");

    // Connect ke network yang digunakan oleh Hardhat.
    // Karena command kita menggunakan --network sepolia,
    // connection ini akan menggunakan konfigurasi Sepolia.
    const { viem } = await network.connect();

    // Mendapatkan Public Client
    const publicClient = await viem.getPublicClient();

    // Mendapatkan Wallet Client / account deployer
    const [deployer] = await viem.getWalletClients();

    console.log(
        `👤 Deployer Account: ${deployer.account.address}`
    );

    // Cek chain ID
    const chainId = await publicClient.getChainId();

    console.log(`🌐 Chain ID: ${chainId}`);

    if (chainId !== 11155111) {
        throw new Error(
            `❌ Network bukan Sepolia! Chain ID saat ini: ${chainId}`
        );
    }

    console.log("✅ Terhubung ke Ethereum Sepolia");

    // ============================================================
    // 1. Deploy MockERC20
    // ============================================================

    console.log("\n📦 Deploying MockERC20 (mUSDC)...");

    const mockERC20 = await viem.deployContract(
        "MockERC20",
        [
            "Mock USDC",
            "mUSDC"
        ]
    );

    console.log(
        `✅ MockERC20 deployed to: ${mockERC20.address}`
    );

    // ============================================================
    // 2. Deploy Vault
    // ============================================================

    console.log("\n🏦 Deploying Vault...");

    const vault = await viem.deployContract(
        "Vault",
        [
            mockERC20.address,
            "DeFi Yield Vault",
            "dYV"
        ]
    );

    console.log(
        `✅ Vault deployed to: ${vault.address}`
    );

    // ============================================================
    // Dummy address
    // ============================================================

    /*
     * Untuk sementara kita menggunakan dummy address.
     *
     * Nanti kalau sudah benar-benar mengintegrasikan
     * Aave dan Compound di Sepolia, address ini harus
     * diganti dengan address contract yang sebenarnya.
     */

    const dummyAToken =
        "0x0000000000000000000000000000000000000001";

    const dummyAavePool =
        "0x0000000000000000000000000000000000000002";

    const dummyComet =
        "0x0000000000000000000000000000000000000003";

    // ============================================================
    // 3. Deploy AaveAdapter
    // ============================================================

    console.log("\n🔌 Deploying AaveAdapter...");

    const aaveAdapter = await viem.deployContract(
        "AaveAdapter",
        [
            vault.address,
            mockERC20.address,
            dummyAToken,
            dummyAavePool
        ]
    );

    console.log(
        `✅ AaveAdapter deployed to: ${aaveAdapter.address}`
    );

    // ============================================================
    // 4. Deploy CompoundAdapter
    // ============================================================

    console.log("\n🔌 Deploying CompoundAdapter...");

    const compoundAdapter = await viem.deployContract(
        "CompoundAdapter",
        [
            vault.address,
            mockERC20.address,
            dummyComet
        ]
    );

    console.log(
        `✅ CompoundAdapter deployed to: ${compoundAdapter.address}`
    );

    // ============================================================
    // 5. Hubungkan Adapter ke Vault
    // ============================================================

    console.log("\n⚙️ Menambahkan adapters ke dalam Vault...");

    await vault.write.addAdapter([
        aaveAdapter.address
    ]);

    console.log(
        "✅ AaveAdapter terhubung ke Vault"
    );

    await vault.write.addAdapter([
        compoundAdapter.address
    ]);

    console.log(
        "✅ CompoundAdapter terhubung ke Vault"
    );

    // ============================================================
    // Deployment selesai
    // ============================================================

    console.log("\n🎉 Deployment Berhasil Selesai!");

    console.log("\n📋 CONTRACT ADDRESSES");
    console.log("--------------------------------");
    console.log(
        `MockERC20      : ${mockERC20.address}`
    );
    console.log(
        `Vault          : ${vault.address}`
    );
    console.log(
        `AaveAdapter    : ${aaveAdapter.address}`
    );
    console.log(
        `CompoundAdapter: ${compoundAdapter.address}`
    );
    console.log("--------------------------------");
}

main().catch((error) => {
    console.error(
        "❌ Error during deployment:",
        error
    );

    process.exitCode = 1;
});