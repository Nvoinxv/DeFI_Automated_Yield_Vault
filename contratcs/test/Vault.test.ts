import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";

describe("Vault", function () {
    async function deployVaultFixture() {
        const [owner, user1] = await hre.viem.getWalletClients();
        const publicClient = await hre.viem.getPublicClient();

        // Deploy mock ERC20 token
        const token = await hre.viem.deployContract("MockERC20", ["Mock Token", "MCK"]);

        // Deploy Vault
        const vault = await hre.viem.deployContract("Vault", [
            token.address,
            "Yield Vault",
            "YVLT",
        ]);

        return { vault, token, owner, user1, publicClient };
    }

    it("Should deploy successfully", async function () {
        const { vault } = await loadFixture(deployVaultFixture);
        expect(await vault.read.name()).to.equal("Yield Vault");
    });
});