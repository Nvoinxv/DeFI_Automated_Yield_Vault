import { ethers } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ═══════════════════════════════════════════════════════════════
// ABI Minimal (Type-safe, as const untuk ethers v6)
// ═══════════════════════════════════════════════════════════════

const POOL_ADDRESSES_PROVIDER_ABI = [
    "function getPool() external view returns (address)",
] as const;

const POOL_ABI = [
    "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
] as const;

// ═══════════════════════════════════════════════════════════════
// Interface untuk Env (Fail Fast & Type Safe)
// ═══════════════════════════════════════════════════════════════

interface DeployEnv {
    PRIVATE_KEY: string;
    SEPOLIA_RPC: string;
    VAULT_ADDRESS: string;
    UNDERLYING_TOKEN: string;
    POOL_ADDRESSES_PROVIDER: string;
}

function validateEnv(): DeployEnv {
    const required: (keyof DeployEnv)[] = [
        "PRIVATE_KEY",
        "SEPOLIA_RPC",
        "VAULT_ADDRESS",
        "UNDERLYING_TOKEN",
        "POOL_ADDRESSES_PROVIDER",
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(
            `❌ ENV missing: ${missing.join(", ")}\n` +
            `Pastikan file .env sudah lengkap di folder contract.`
        );
    }

    return {
        PRIVATE_KEY: process.env.PRIVATE_KEY!,
        SEPOLIA_RPC: process.env.SEPOLIA_RPC!,
        VAULT_ADDRESS: process.env.VAULT_ADDRESS!,
        UNDERLYING_TOKEN: process.env.UNDERLYING_TOKEN!,
        POOL_ADDRESSES_PROVIDER: process.env.POOL_ADDRESSES_PROVIDER!,
    };
}

// ═══════════════════════════════════════════════════════════════
// Main Deploy Function
// ═══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
    // 1. Ambil deployer
    const [deployer]: Signer[] = await ethers.getSigners();
    const deployerAddress: string = await deployer.getAddress();

    console.log("🔑 Deployer:", deployerAddress);

    // 2. Validasi env
    const env = validateEnv();

    // 3. Cek balance (butuh gas)
    const balance: bigint = await ethers.provider.getBalance(deployerAddress);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

    if (balance === 0n) {
        throw new Error(
            "ETH habis! Mint gratis di Sepolia Faucet:\n" +
            "https://sepoliafaucet.com atau https://faucet.quicknode.com/ethereum/sepolia"
        );
    }

    // 4. Ambil Aave Pool & aToken dari blockchain (REAL on-chain data)
    console.log("\n📡 Mengambil data Aave dari blockchain Sepolia...");

    const addressesProvider = new ethers.Contract(
        env.POOL_ADDRESSES_PROVIDER,
        POOL_ADDRESSES_PROVIDER_ABI,
        deployer
    );

    const poolAddress: string = await addressesProvider.getPool();
    console.log("🏊 Aave Pool:", poolAddress);

    const pool = new ethers.Contract(poolAddress, POOL_ABI, deployer);

    // getReserveData return tuple, index 8 = aTokenAddress
    const reserveData: [
        bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
        string, string, string, string, bigint, bigint, bigint
    ] = await pool.getReserveData(env.UNDERLYING_TOKEN);

    const aTokenAddress: string = reserveData[8];

    console.log("🪙 Underlying Token:", env.UNDERLYING_TOKEN);
    console.log("🪙 aToken:", aTokenAddress);

    if (aTokenAddress === ethers.ZeroAddress) {
        throw new Error(
            "❌ aToken tidak ditemukan!\n" +
            "Kemungkinan UNDERLYING_TOKEN bukan token yang didukung Aave Sepolia.\n" +
            "Gunakan Aave test USDC: 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"
        );
    }

    // 5. Deploy AaveAdapter.sol
    console.log("\n🚀 Deploying AaveAdapter...");

    const AaveAdapterFactory: ContractFactory = await ethers.getContractFactory("AaveAdapter");

    const adapter: Contract = await AaveAdapterFactory.deploy(
        env.VAULT_ADDRESS,
        env.UNDERLYING_TOKEN,
        aTokenAddress,
        poolAddress
    );

    await adapter.waitForDeployment();

    const adapterAddress: string = await adapter.getAddress();

    // 6. Verifikasi deploy sukses (call totalAssets, nggak boleh revert)
    console.log("🔍 Verifikasi deploy...");

    try {
        const totalAssets: bigint = await adapter.totalAssets();
        console.log("✅ totalAssets():", totalAssets.toString(), "(OK, contract hidup)");
    } catch (err) {
        console.warn("⚠️ Verifikasi gagal, tapi deploy sukses. Cek manual di Etherscan.");
    }

    // 7. Output siap copy-paste
    console.log("\n" + "═".repeat(60));
    console.log("✅ AAVE ADAPTER BERHASIL DI-DEPLOY!");
    console.log("═".repeat(60));
    console.log("\n📋 Copy ini ke backend .env lu:");
    console.log("");
    console.log(`AAVE_ADAPTER_ADDRESS=${adapterAddress}`);
    console.log(`# Data verifikasi:`);
    console.log(`# - Vault       : ${env.VAULT_ADDRESS}`);
    console.log(`# - Underlying  : ${env.UNDERLYING_TOKEN}`);
    console.log(`# - aToken      : ${aTokenAddress}`);
    console.log(`# - Aave Pool   : ${poolAddress}`);
    console.log(`# - Deployer    : ${deployerAddress}`);
    console.log(`# - Tx Explorer : https://sepolia.etherscan.io/address/${adapterAddress}`);
    console.log("\n" + "═".repeat(60));
}

// ═══════════════════════════════════════════════════════════════
// Error Handler
// ═══════════════════════════════════════════════════════════════

main().catch((error: Error) => {
    console.error("\n❌ Deploy gagal:");
    console.error(error.message);
    process.exitCode = 1;
});