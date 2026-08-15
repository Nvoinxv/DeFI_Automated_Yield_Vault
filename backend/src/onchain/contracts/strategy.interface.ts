/**
 * Interface standar untuk semua strategy adapter (Aave, Compound, dll).
 * Worker cukup panggil method ini tanpa peduli protocol apa di belakangnya.
 */
export interface IStrategyAdapter {
    /** Nama protocol, e.g. "Aave V3", "Compound V3" */
    getProtocolName(): string;

    /**
     * APY saat ini dalam bentuk desimal.
     * @example 0.0523 = 5.23% APY
     */
    getCurrentApy(): Promise<number>;

    /**
     * Total Value Locked di protocol ini (dalam wei / smallest unit).
     * Untuk Aave: balance aToken = totalAssets() dari adapter contract.
     */
    getTvl(): Promise<bigint>;

    /**
     * Balance underlying token yang ada di contract adapter (belum di-invest).
     */
    getUnderlyingBalance(): Promise<bigint>;

    /**
     * Cek apakah adapter aktif dan bisa menerima deposit.
     */
    isActive(): Promise<boolean>;
}