// src/config/viem.config.ts
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { sepolia, hardhat } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const chainId = parseInt(process.env.CHAIN_ID || '31337', 10);

// Pilih chain berdasarkan env
const chain = chainId === 11155111 ? sepolia : hardhat;

// === CLIENT BACA (Gratis, tidak butuh private key) ===
export const publicClient: PublicClient = createPublicClient({
    chain,
    transport: http(process.env.RPC_URL),
});

// === CLIENT TULIS (Butuh signer — hanya dipakai di Rebalancer!) ===
export const walletClient: WalletClient = createWalletClient({
    chain,
    transport: http(process.env.SEPOLIA_URL),
});

export { chain, chainId };