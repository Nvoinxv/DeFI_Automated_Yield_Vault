import "dotenv/config"; // 👈 Tambahkan baris ini di paling atas
import { ethers } from "ethers";

const SEPOLIA_URL = process.env.SEPOLIA_URL;
if (!SEPOLIA_URL) {
    console.error("❌ SEPOLIA_URL tidak ditemukan di file .env!");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(SEPOLIA_URL);
const addressesProviderAddress = "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A";

async function main() {
    try {
        const code = await provider.getCode(addressesProviderAddress);

        if (code === "0x") {
            console.error("❌ Alamat ini adalah Wallet biasa (EOA) atau tidak ada kontrak terdeploy!");
            return;
        }

        console.log("✅ Kontrak PoolAddressesProvider ditemukan!");

        const abi = ["function getPool() external view returns (address)"];
        const providerContract = new ethers.Contract(addressesProviderAddress, abi, provider);
        const poolAddress = await providerContract.getPool();

        console.log("📍 Alamat Aave V3 Pool di Sepolia:", poolAddress);
    } catch (error) {
        console.error("❌ Terjadi kesalahan saat menghubungi RPC:", error);
    }
}

main();