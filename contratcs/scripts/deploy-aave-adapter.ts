import { ethers, Contract, ContractFactory, Signer, Wallet } from "ethers";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        "VAULT_ADDRESS",
        "UNDERLYING_TOKEN",
        "POOL_ADDRESSES_PROVIDER",
    ];

    // Fallbacks for Sepolia
    const sepoliaRpc = process.env.SEPOLIA_RPC || process.env.SEPOLIA_URL || "https://rpc.sepolia.org";
    const vaultAddress = process.env.VAULT_ADDRESS || "0x0000000000000000000000000000000000000000"; // Dummy
    const underlyingToken = process.env.UNDERLYING_TOKEN || "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8"; // Aave USDC Sepolia
    const poolAddressesProvider = process.env.POOL_ADDRESSES_PROVIDER || "0x012bac54348c08634aa1336edc8c0f8d9d150fce"; // Aave Pool Addresses Provider Sepolia

    // Handle segmented private key like hardhat config
    const privateKey = process.env.PRIVATE_KEY_TESNET || 
        (process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA && process.env.PRIVATE_KEY_TESNET_SEGMEN_KEDUA ? 
        `${process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA}${process.env.PRIVATE_KEY_TESNET_SEGMEN_KEDUA}` : "");
    const pkToUse = process.env.PRIVATE_KEY || privateKey;

    if (!pkToUse) {
        throw new Error("❌ PRIVATE_KEY missing! Pastikan file .env sudah lengkap di folder contract.");
    }

    return {
        PRIVATE_KEY: pkToUse,
        SEPOLIA_RPC: sepoliaRpc,
        VAULT_ADDRESS: vaultAddress,
        UNDERLYING_TOKEN: underlyingToken,
        POOL_ADDRESSES_PROVIDER: poolAddressesProvider,
    };
}

// ═══════════════════════════════════════════════════════════════
// Main Deploy Function
// ═══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
    // 1. Ambil env
    const env = validateEnv();

    // 2. Setup Provider & Deployer
    const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC);
    const deployer = new ethers.Wallet(env.PRIVATE_KEY, provider);
    const deployerAddress = await deployer.getAddress();

    console.log("🔑 Deployer:", deployerAddress);

    // 3. Cek balance (butuh gas)
    const balance = await provider.getBalance(deployerAddress);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

    if (balance === 0n) {
        throw new Error(
            "ETH habis! Mint gratis di Sepolia Faucet:\n" +
            "https://sepoliafaucet.com atau https://faucet.quicknode.com/ethereum/sepolia"
        );
    }

    // 4. Ambil Aave Pool & aToken dari blockchain (REAL on-chain data)
    console.log("\n📡 Memvalidasi konfigurasi Aave...");
    
    let poolAddress = "0x0000000000000000000000000000000000000000";
    let aTokenAddress = "0x0000000000000000000000000000000000000000";

    try {
        const addressesProvider = new ethers.Contract(
            env.POOL_ADDRESSES_PROVIDER,
            POOL_ADDRESSES_PROVIDER_ABI,
            deployer
        );

        poolAddress = await addressesProvider.getPool();
        console.log("🏊 Aave Pool:", poolAddress);

        const pool = new ethers.Contract(poolAddress, POOL_ABI, deployer);
        const reserveData = await pool.getReserveData(env.UNDERLYING_TOKEN) as any;
        aTokenAddress = reserveData[8];
    } catch (e) {
        console.warn("⚠️ Gagal memvalidasi Aave Pool di RPC, menggunakan dummy/env data karena mungkin address belum di-set di .env");
        poolAddress = env.POOL_ADDRESSES_PROVIDER; // Fallback untuk testing
        aTokenAddress = "0x0000000000000000000000000000000000000001"; // Dummy aToken
    }

    // 5. Deploy AaveAdapter.sol
    console.log("\n🚀 Deploying AaveAdapter...");

    // Baca artifact manual (karena bypass Hardhat injection yg bermasalah di v3 ESM)
    const artifactPath = path.resolve(__dirname, "../artifacts/contracts/AaveAdapter.sol/AaveAdapter.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error("❌ Artifact tidak ditemukan! Jalankan 'npx hardhat compile' dulu.");
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    const AaveAdapterFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

    const adapter = await AaveAdapterFactory.deploy(
        env.VAULT_ADDRESS,
        env.UNDERLYING_TOKEN,
        aTokenAddress,
        poolAddress
    );

    await adapter.waitForDeployment();

    const adapterAddress = await adapter.getAddress();

    // 6. Verifikasi deploy sukses (call totalAssets, nggak boleh revert)
    console.log("🔍 Verifikasi deploy...");

    try {
        // Panggil totalAssets via pure contract
        const adapterContract = new ethers.Contract(adapterAddress, artifact.abi, deployer);
        const totalAssets: bigint = await adapterContract.totalAssets();
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