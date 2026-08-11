import { defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
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
    },
});