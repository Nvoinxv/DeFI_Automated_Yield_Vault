import { defineConfig } from "hardhat/config";
import toolboxPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import ethersPlugin from "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const privateKey = process.env.PRIVATE_KEY_TESNET || 
    (process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA && process.env.PRIVATE_KEY_TESNET_SEGMEN_KEDUA ? 
    `${process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA}${process.env.PRIVATE_KEY_TESNET_SEGMEN_KEDUA}` : "");

const pkToUse = process.env.PRIVATE_KEY || privateKey;

export default defineConfig({
    plugins: [toolboxPlugin, ethersPlugin],
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
        sepolia: {
            type: "http",
            url: process.env.SEPOLIA_URL || process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
            accounts: pkToUse ? [pkToUse] : [],
        },
    },

    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
});