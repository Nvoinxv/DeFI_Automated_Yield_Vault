import { defineConfig } from "hardhat/config";
import toolboxPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config(); // ← Biar bisa baca file .env

const privateKey = process.env.PRIVATE_KEY_TESNET || 
    (process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA && process.env.PRIVATE_KEY_TESNET_SEGMEN_KEDUA ? 
    `${process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA}${process.env.PRIVATE_KEY_TESNET_SEGMEN_KEDUA}` : "");

export default defineConfig({
    plugins: [toolboxPlugin],
    solidity: {
        version: "0.8.27",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },

    networks: {
        hardhat: {
            type: "edr-simulated",
            chainId: 31337,
        },
        // Sepolia Testnet
        sepolia: {
            type: "http",
            url: process.env.SEPOLIA_URL || "https://rpc.sepolia.org",
            accounts: privateKey ? [privateKey] : [],
        },
    },

    // Etherscan buat verify contract (opsional tapi recommended)
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
});