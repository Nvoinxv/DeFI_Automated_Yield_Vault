import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// ═══════════════════════════════════════════════════════════════
// Bitget Wallet: 2-Segmen Private Key Assembler
// ═══════════════════════════════════════════════════════════════

/**
 * Validasi format private key Ethereum.
 * Harus: 0x + 64 karakter hex = total 66 karakter.
 */
function isValidPrivateKey(pk: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(pk);
}

/**
 * Ambil private key dari .env dengan support 2 mode:
 * 1. Bitget Wallet (2 segmen): PRIVATE_KEY_TESNET_SEGMEN_PERTAMA + KEDUA
 * 2. Wallet biasa (1 key): PRIVATE_KEY
 */
function getPrivateKey(): string[] {
    // Mode 1: Bitget 2-segmen (prioritas)
    const seg1 = (process.env.PRIVATE_KEY_TESNET_SEGMEN_PERTAMA || "").trim();
    const seg2 = (process.env.PRIVATE_KEY_TESNET_SEGMEN_KEDUA || "").trim();

    if (seg1 && seg2) {
        let combined: string;

        // Bitget kadang kasih 0x di kedua segmen, kadang cuma di segmen 1.
        // Logic: selalu hasilkan 0x + segmen1 + segmen2 (tanpa duplikasi 0x)
        const cleanSeg1 = seg1.startsWith("0x") ? seg1.slice(2) : seg1;
        const cleanSeg2 = seg2.startsWith("0x") ? seg2.slice(2) : seg2;

        combined = `0x${cleanSeg1}${cleanSeg2}`;

        if (!isValidPrivateKey(combined)) {
            throw new Error(
                `❌ Gabungan 2 segmen Bitget tidak valid!\n\n` +
                `Segmen 1: ${seg1.length} char\n` +
                `Segmen 2: ${seg2.length} char\n` +
                `Hasil gabung: ${combined.length} char (harus 66: 0x + 64 hex)\n\n` +
                `Cek ulang:\n` +
                `1. Urutan segmen (Pertama → Kedua) benar?\n` +
                `2. Tidak ada spasi/enter di tengah?\n` +
                `3. Kedua segmen lengkap (masing-masing 32-34 char)?`
            );
        }

        console.log("🔐 Mode: Bitget Wallet (2 segmen digabungkan)");
        return [combined];
    }

    // Mode 2: Private key biasa (1 string utuh)
    const pk = (process.env.PRIVATE_KEY || "").trim();
    if (pk) {
        if (!isValidPrivateKey(pk)) {
            throw new Error(
                `❌ PRIVATE_KEY tidak valid!\n` +
                `Panjang: ${pk.length} char (harus 66: 0x + 64 hex)\n` +
                `Format: 0x1234...abcd (hanya hex 0-9, a-f, A-F)`
            );
        }
        console.log("🔐 Mode: Standard Wallet (1 private key)");
        return [pk];
    }

    // Mode 3: Gagal total
    throw new Error(
        `❌ Private key tidak ditemukan di .env!\n\n` +
        `Untuk Bitget Wallet:\n` +
        `  PRIVATE_KEY_TESNET_SEGMEN_PERTAMA=0x1234...\n` +
        `  PRIVATE_KEY_TESNET_SEGMEN_KEDUA=abcd...\n\n` +
        `Untuk wallet lain (MetaMask/Rabby):\n` +
        `  PRIVATE_KEY=0x1234...abcd\n\n` +
        `Pastikan file .env ada di root folder contract.`
    );
}

const accounts = getPrivateKey();

const config: HardhatUserConfig = {
    solidity: "0.8.27",
    networks: {
        sepolia: {
            url: process.env.SEPOLIA_RPC || "",
            accounts, // Ethers/Hardhat expect: string[]
        },
        hardhat: {
            chainId: 31337,
        },
    },
    typechain: {
        outDir: "typechain-types",
        target: "ethers-v6",
    },
};

export default config;