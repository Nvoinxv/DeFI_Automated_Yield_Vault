import { Injectable } from '@nestjs/common';
import { publicClient } from '../../config/viem.config';
import { IStrategyAdapter } from './strategy.interface';

// ═══════════════════════════════════════════════════════════════
// Minimal ABI untuk AaveAdapter contract (custom contract kita)
// ABI lengkap bisa generate dari Foundry: forge build → copy dari out/
// ═══════════════════════════════════════════════════════════════
const AAVE_ADAPTER_ABI = [
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
        name: 'aToken',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'aavePool',
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

// ═══════════════════════════════════════════════════════════════
// Minimal ABI untuk Aave V3 Pool → getReserveData
// Full ABI ada di: src/onchain/abis/aave-pool.abi.json
// ═══════════════════════════════════════════════════════════════
const AAVE_POOL_GET_RESERVE_DATA_ABI = [
    {
        inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
        name: 'getReserveData',
        outputs: [
            { internalType: 'uint256', name: 'configuration', type: 'uint256' },
            { internalType: 'uint128', name: 'liquidityIndex', type: 'uint128' },
            { internalType: 'uint128', name: 'currentLiquidityRate', type: 'uint128' },
            { internalType: 'uint128', name: 'variableBorrowIndex', type: 'uint128' },
            { internalType: 'uint128', name: 'currentVariableBorrowRate', type: 'uint128' },
            { internalType: 'uint128', name: 'currentStableBorrowRate', type: 'uint128' },
            { internalType: 'uint40', name: 'lastUpdateTimestamp', type: 'uint40' },
            { internalType: 'uint16', name: 'id', type: 'uint16' },
            { internalType: 'address', name: 'aTokenAddress', type: 'address' },
            { internalType: 'address', name: 'stableDebtTokenAddress', type: 'address' },
            { internalType: 'address', name: 'variableDebtTokenAddress', type: 'address' },
            { internalType: 'address', name: 'interestRateStrategyAddress', type: 'address' },
            { internalType: 'uint128', name: 'accruedToTreasury', type: 'uint128' },
            { internalType: 'uint128', name: 'unbacked', type: 'uint128' },
            { internalType: 'uint128', name: 'isolationModeTotalDebt', type: 'uint128' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// ═══════════════════════════════════════════════════════════════
// Minimal ERC20 ABI untuk balanceOf
// ═══════════════════════════════════════════════════════════════
const ERC20_BALANCE_OF_ABI = [
    {
        inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

@Injectable()
export class AaveAdapterContract implements IStrategyAdapter {
    private readonly adapterAddress: `0x${string}`;

    constructor() {
        const address = process.env.AAVE_ADAPTER_ADDRESS;
        if (!address || !address.startsWith('0x') || address.length !== 42) {
            throw new Error(
                '❌ AAVE_ADAPTER_ADDRESS invalid atau tidak di-set di .env. ' +
                'Pastikan alamat adapter Aave sudah di-deploy dan di-set dengan benar.',
            );
        }
        this.adapterAddress = address as `0x${string}`;
    }

    getProtocolName(): string {
        return 'Aave V3';
    }

    /**
     * Hitung APY real dari on-chain Aave V3 Pool.
     *
     * Alur:
     * 1. Baca underlyingToken & aavePool address dari adapter contract kita
     * 2. Panggil getReserveData(underlyingToken) ke Aave Pool
     * 3. Ambil currentLiquidityRate (index 2, uint128, RAY = 27 decimals)
     * 4. Konversi ke APY dengan compound interest formula
     *
     * @returns APY dalam desimal (e.g. 0.0523 = 5.23%)
     */
    async getCurrentApy(): Promise<number> {
        try {
            // 1. Ambil konfigurasi dari adapter contract kita (parallel read)
            const [underlyingToken, aavePoolAddress] = await Promise.all([
                publicClient.readContract({
                    address: this.adapterAddress,
                    abi: AAVE_ADAPTER_ABI,
                    functionName: 'underlyingToken',
                }),
                publicClient.readContract({
                    address: this.adapterAddress,
                    abi: AAVE_ADAPTER_ABI,
                    functionName: 'aavePool',
                }),
            ]);

            // 2. Baca reserve data dari Aave Pool
            //    getReserveData returns tuple:
            //    [0: configuration, 1: liquidityIndex, 2: currentLiquidityRate, ...]
            const reserveData = await publicClient.readContract({
                address: aavePoolAddress,
                abi: AAVE_POOL_GET_RESERVE_DATA_ABI,
                functionName: 'getReserveData',
                args: [underlyingToken],
            });

            // 3. Extract currentLiquidityRate (index 2) → bigint dalam RAY (27 decimals)
            const currentLiquidityRate = reserveData[2];

            // 4. Konversi RAY ke APY
            //    RAY = 10^27. ratePerSecond = currentLiquidityRate / 10^27
            //    APY = (1 + ratePerSecond) ^ secondsPerYear - 1
            const ratePerSecond = Number(currentLiquidityRate) / 1e27;
            const SECONDS_PER_YEAR = 31_557_600; // 365.25 * 24 * 60 * 60

            // Compound formula (lebih akurat dari linear untuk rate > 5%)
            const apy = Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;

            // 🛡️ Sanity check: APY tidak boleh negatif atau > 1000%
            if (apy < 0 || apy > 10) {
                console.warn('⚠️ [AaveAdapter] APY anomali terdeteksi:', apy, '→ return 0');
                return 0;
            }

            return apy;
        } catch (error) {
            console.error('❌ [AaveAdapter] Gagal menghitung APY:', error);
            // Fail fast: biar Worker BullMQ catch error dan retry sesuai policy
            throw new Error(`Aave APY calculation failed: ${error.message}`);
        }
    }

    /**
     * TVL = totalAssets() dari AaveAdapter contract.
     *
     * Di Solidity kamu:
     *   totalAssets() { return IERC20(aToken).balanceOf(address(this)); }
     *
     * Jadi ini = jumlah underlying (dalam satuan aToken) yang sedang
     * di-supply ke Aave pool.
     */
    async getTvl(): Promise<bigint> {
        try {
            const totalAssets = await publicClient.readContract({
                address: this.adapterAddress,
                abi: AAVE_ADAPTER_ABI,
                functionName: 'totalAssets',
            });

            return totalAssets;
        } catch (error) {
            console.error('❌ [AaveAdapter] Gagal membaca TVL:', error);
            throw new Error(`Aave TVL read failed: ${error.message}`);
        }
    }

    /**
     * Balance underlying token yang ada di contract adapter (belum di-supply).
     * Biasanya 0, kecuali ada dana yang baru di-withdraw atau belum di-deposit.
     */
    async getUnderlyingBalance(): Promise<bigint> {
        try {
            const underlyingToken = await publicClient.readContract({
                address: this.adapterAddress,
                abi: AAVE_ADAPTER_ABI,
                functionName: 'underlyingToken',
            });

            const balance = await publicClient.readContract({
                address: underlyingToken,
                abi: ERC20_BALANCE_OF_ABI,
                functionName: 'balanceOf',
                args: [this.adapterAddress],
            });

            return balance;
        } catch (error) {
            console.error('❌ [AaveAdapter] Gagal membaca underlying balance:', error);
            throw new Error(`Aave underlying balance read failed: ${error.message}`);
        }
    }

    /**
     * Cek status aktif adapter dari smart contract.
     * Di Solidity: isActive() = _isActive && !paused()
     */
    async isActive(): Promise<boolean> {
        try {
            const active = await publicClient.readContract({
                address: this.adapterAddress,
                abi: AAVE_ADAPTER_ABI,
                functionName: 'isActive',
            });
            return active;
        } catch (error) {
            console.error('❌ [AaveAdapter] Gagal cek status aktif:', error);
            // Safety first: kalau gagal baca, anggap tidak aktif
            return false;
        }
    }
}