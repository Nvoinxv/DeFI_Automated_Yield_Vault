import { Injectable } from '@nestjs/common';
import { publicClient } from '../../config/viem.config.js';
import { type IStrategyAdapter } from './strategy.interface.js';

// ── ABI: CompoundAdapter.sol (sesuai kontrak lo) ──
const COMPOUND_ADAPTER_ABI = [
    {
        inputs: [],
        name: 'totalAssets',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'underlyingToken',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'comet',
        outputs: [{ internalType: 'contract IComet', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'vault',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'isActive',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// ── ABI: Compound v3 Comet (IComet) ──
// Dibutuhkan untuk baca supply rate & balance (rebasing model)
const COMET_ABI = [
    {
        inputs: [],
        name: 'getSupplyRate',
        outputs: [{ internalType: 'uint64', name: '', type: 'uint64' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'baseToken',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// ── ABI: ERC20 (untuk cek idle underlying di adapter) ──
const ERC20_ABI = [
    {
        inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

const SECONDS_PER_YEAR = 31_536_000; // 365 * 24 * 3600
const RATE_SCALE = 1e18; // Compound v3: getSupplyRate scaled by 1e18

@Injectable()
export class CompoundAdapterContract implements IStrategyAdapter {
    async isActive(): Promise<boolean> {
        return publicClient.readContract({
            address: this.adapterAddress,
            abi: COMPOUND_ADAPTER_ABI,
            functionName: 'isActive',
        });
    }

    private readonly adapterAddress: `0x${string}`;
    private cometAddress: `0x${string}` | null = null;
    private underlyingAddress: `0x${string}` | null = null;

    constructor() {
        const addr = process.env.COMPOUND_ADAPTER_ADDRESS as `0x${string}`;
        if (!addr || !addr.startsWith('0x')) {
            throw new Error('❌ COMPOUND_ADAPTER_ADDRESS invalid atau kosong di .env');
        }
        this.adapterAddress = addr;
    }

    getProtocolName(): string {
        return 'Compound';
    }

    // ═══════════════════════════════════════════════════════
    // Helper: lazy-load alamat Comet (cToken v3)
    // ═══════════════════════════════════════════════════════
    private async getCometAddress(): Promise<`0x${string}`> {
        if (this.cometAddress) return this.cometAddress;

        const addr = await publicClient.readContract({
            address: this.adapterAddress,
            abi: COMPOUND_ADAPTER_ABI,
            functionName: 'comet',
        });

        this.cometAddress = addr;
        return addr;
    }

    // ═══════════════════════════════════════════════════════
    // Helper: lazy-load alamat underlying token
    // ═══════════════════════════════════════════════════════
    private async getUnderlyingAddress(): Promise<`0x${string}`> {
        if (this.underlyingAddress) return this.underlyingAddress;

        const addr = await publicClient.readContract({
            address: this.adapterAddress,
            abi: COMPOUND_ADAPTER_ABI,
            functionName: 'underlyingToken',
        });

        this.underlyingAddress = addr;
        return addr;
    }

    // ═══════════════════════════════════════════════════════
    // getCurrentApy: Hitung APY real dari on-chain state
    // Compound v3 → getSupplyRate() = per-second rate (scale 1e18)
    // Formula: APY = (1 + ratePerSecond) ^ secondsPerYear - 1
    // ═══════════════════════════════════════════════════════
    async getCurrentApy(): Promise<number> {
        try {
            const comet = await this.getCometAddress();

            const supplyRatePerSecond = await publicClient.readContract({
                address: comet,
                abi: COMET_ABI,
                functionName: 'getSupplyRate',
            });

            // supplyRatePerSecond adalah uint64 yang di-scale 1e18.
            // Contoh real: kalau supplyRate = 3_170_979_198 (≈ 3.17e9),
            // maka ratePerSecond = 3.17e9 / 1e18 = 3.17e-9
            // APY = (1 + 3.17e-9) ^ 31_536_000 - 1 ≈ 0.10 (10%)
            const ratePerSecond = Number(supplyRatePerSecond) / RATE_SCALE;

            if (ratePerSecond <= 0) {
                return 0;
            }

            const apy = Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;

            // Sanity check: APY Compound jarang > 100% di stablecoin market
            if (apy > 5) {
                console.warn('⚠️ Compound APY terlalu tinggi (>500%), cek scale/rate:', apy);
            }

            return apy;
        } catch (error) {
            console.error('❌ Gagal hitung Compound APY:', error);
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════
    // getTvl: Total value locked di adapter ini
    // Compound v3 rebasing: balanceOf(comet) = principal + bunga
    // ═══════════════════════════════════════════════════════
    async getTvl(): Promise<bigint> {
        // totalAssets() di Solidity = IERC20(comet).balanceOf(this)
        return publicClient.readContract({
            address: this.adapterAddress,
            abi: COMPOUND_ADAPTER_ABI,
            functionName: 'totalAssets',
        });
    }

    // ═══════════════════════════════════════════════════════
    // getUnderlyingBalance: Dana idle (belum di-supply ke Compound)
    // Biasanya 0, tapi penting untuk rebalancing logic
    // ═══════════════════════════════════════════════════════
    async getUnderlyingBalance(): Promise<bigint> {
        const underlying = await this.getUnderlyingAddress();

        return publicClient.readContract({
            address: underlying,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [this.adapterAddress],
        });
    }
}