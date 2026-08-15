import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const POOL_ADDRESSES_PROVIDER_ABI = [
    "function getPool() external view returns (address)",
] as const;

const POOL_ABI = [
    "function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
] as const;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🔑 Deployer Address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH\n");

    if (balance === 0n) {
        throw new Error("❌ ETH Sepolia kamu 0! Ambil faucet dulu.");
    }

    // Parameter Konfigurasi Sepolia
    const UNDERLYING_TOKEN = process.env.UNDERLYING_TOKEN || "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8"; // USDC Sepolia
    const POOL_ADDRESSES_PROVIDER = process.env.POOL_ADDRESSES_PROVIDER || "0x012bac54348c08634aa1336edc8c0f8d9d150fce";

    // -------------------------------------------------------------
    // 1. DEPLOY VAULT.SOL
    // -------------------------------------------------------------
    console.log("🚀 [1/3] Deploying Vault.sol...");
    const VaultFactory = await ethers.getContractFactory("Vault");
    const vault = await VaultFactory.deploy(
        UNDERLYING_TOKEN,
        "Automated Yield Vault USDC",
        "ayUSDC"
    );
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log("✅ Vault deployed to:", vaultAddress);

    // -------------------------------------------------------------
    // 2. FETCH AAVE POOL DATA & DEPLOY AAVE ADAPTER
    // -------------------------------------------------------------
    console.log("\n📡 [2/3] Fetching Aave Pool & Deploying AaveAdapter.sol...");

    let poolAddress = POOL_ADDRESSES_PROVIDER;
    let aTokenAddress = "0x16dA4541aD1807f4443d92D26044C1147406EB80"; // USDC aToken Sepolia Fallback

    try {
        const addressesProvider = new ethers.Contract(POOL_ADDRESSES_PROVIDER, POOL_ADDRESSES_PROVIDER_ABI, deployer);
        poolAddress = await addressesProvider.getPool();

        const pool = new ethers.Contract(poolAddress, POOL_ABI, deployer);
        const reserveData = await pool.getReserveData(UNDERLYING_TOKEN) as any;
        aTokenAddress = reserveData[8];
    } catch (e) {
        console.warn("⚠️ Gagal fetch Aave Pool via RPC, menggunakan fallback address.");
    }

    const artifactPath = path.resolve(__dirname, "../artifacts/contracts/AaveAdapter.sol/AaveAdapter.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const AaveAdapterFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

    const adapter = await AaveAdapterFactory.deploy(
        vaultAddress,       // ALAMAT VAULT YANG BARU DIDEPLOY
        UNDERLYING_TOKEN,
        aTokenAddress,
        poolAddress
    );
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    console.log("✅ AaveAdapter deployed to:", adapterAddress);

    // -------------------------------------------------------------
    // 3. DAFTARKAN ADAPTER KE VAULT VIA addAdapter()
    // -------------------------------------------------------------
    console.log("\n🔗 [3/3] Linking AaveAdapter to Vault...");
    const addTx = await vault.addAdapter(adapterAddress);
    await addTx.wait();
    console.log("✅ Adapter registered into Vault!");

    // -------------------------------------------------------------
    // REKAP ALAMAT UNTUK BACKEND DAY 2
    // -------------------------------------------------------------
    console.log("\n" + "═".repeat(60));
    console.log("🎉 SEMUA CONTRACT BERHASIL DI-DEPLOY & TERHUBUNG!");
    console.log("═".repeat(60));
    console.log(`VAULT_ADDRESS=${vaultAddress}`);
    console.log(`AAVE_ADAPTER_ADDRESS=${adapterAddress}`);
    console.log(`UNDERLYING_TOKEN=${UNDERLYING_TOKEN}`);
    console.log("═".repeat(60));
}

main().catch((error) => {
    console.error("\n❌ Deployment Gagal:", error);
    process.exitCode = 1;
});