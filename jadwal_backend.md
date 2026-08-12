# 📅 Jadwal Pengerjaan Backend — DeFi Automated Yield Vault

> **Versi:** 1.0  
> **Estimasi:** 5–6 Minggu (Part-time, ~10–15 jam/minggu)  
> **Asumsi:** Day 1 (Security Foundation) sudah selesai ✅  
> **Stack:** NestJS 11 + Prisma + Postgres + Redis/BullMQ + viem

---

## 🗺️ Peta Jalan Singkat

```
Minggu 1: Onchain + Indexer Core          (Koneksi blockchain + dengerin event)
Minggu 2: Worker (APY & Rebalance)       (Hitung bunga + trigger pindah dana)
Minggu 3: Rebalancer + Signer            (Eksekusi transaksi dengan aman)
Minggu 4: API Layer                      (Endpoint buat frontend)
Minggu 5: Testing + Hardening            (Ujung tombak keamanan & edge case)
Minggu 6: Deploy + Dokumentasi           (Orang lain bisa clone & jalanin)
```

**Aturan Emas:**  
> Kalau checkpoint kritis belum lolos, **jangan lanjut**. Lebih baik telat 1 hari daripada numpuk technical debt.

---

## ✅ Day 1 — DONE: Security Foundation

**Status:** ✅ Selesai  
**Isi:** `.env`, `.gitignore`, `docker-compose.yml`, `prisma/schema.prisma`, `viem.config.ts`, `PrismaModule`, `HealthModule`

**Checkpoint:**
- [x] `GET /health` return 200
- [x] `docker-compose up -d` jalan (Postgres + Redis)
- [x] `npx prisma migrate dev` sukses
- [x] `.env` tidak ter-commit (cek `git status`)

---

## 🏦 Minggu 1: Onchain + Indexer Core

> **Tujuan Minggu Ini:** Backend bisa "ngomong" ke smart contract dan mencatat event on-chain ke database tanpa takut double-entry atau reorg.

---

### Day 2 — Onchain Module: Kenalan sama Smart Contract

**🎯 Tujuan Hari Ini:**  
Backend bisa baca data dari `Vault.sol` di Sepolia/Anvil — total assets, total shares, posisi adapter.

**📁 File yang Dibikin:**
```
src/onchain/
├── onchain.module.ts
├── onchain.service.ts
├── contracts/
│   ├── vault.contract.ts
│   ├── aave-adapter.contract.ts
│   └── compound-adapter.contract.ts
└── abis/
    ├── vault.abi.json        ← Copy dari Foundry build artifact
    ├── aave-pool.abi.json    ← Dari docs Aave atau Etherscan
    └── compound-ctoken.abi.json
```

**🛠️ Perintah CLI:**
```bash
nest g module onchain
nest g service onchain

# Buat folder manual (CLI nggak bikin subfolder)
mkdir -p src/onchain/contracts src/onchain/abis
```

**📝 Isi File Penting:**

`src/onchain/contracts/vault.contract.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { publicClient } from '../../config/viem.config';

const VAULT_ABI = [ /* paste ABI Vault.sol */ ] as const;
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as `0x${string}`;

@Injectable()
export class VaultContract {
  async getTotalAssets(): Promise<bigint> {
    return publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'totalAssets',
    });
  }

  async getTotalSupply(): Promise<bigint> {
    return publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'totalSupply',
    });
  }
}
```

**⚠️ Security Note:**  
- `VAULT_ADDRESS` wajib dari `process.env`. Jangan hardcode.  
- Kalau address salah, semua query jalan ke contract orang lain (phantom read).

**🧪 Checkpoint Hari Ini:**
```bash
# Buat test manual di controller sementara
# GET /onchain/test → return { totalAssets: "1230000000000000000" }
```
- [ ] `getTotalAssets()` return angka valid (bukan 0 kalau contract memang punya dana)
- [ ] `getTotalSupply()` return angka valid
- [ ] Kalau `VAULT_ADDRESS` di `.env` dihapus, app **langsung error** saat startup (fail fast)

---

### Day 3 — Onchain Module: Adapter Interface

**🎯 Tujuan Hari Ini:**  
Buat interface seragam buat Aave & Compound — biar Worker nanti nggak perlu tau bedanya Aave vs Compound.

**📁 File yang Dibikin:**
```
src/onchain/contracts/
├── strategy.interface.ts       ← Kontrak abstrak
├── aave-adapter.contract.ts    ← Implementasi Aave
└── compound-adapter.contract.ts  ← Implementasi Compound
```

**📝 Isi File Penting:**

`src/onchain/contracts/strategy.interface.ts`:
```typescript
export interface IStrategyAdapter {
  getProtocolName(): string;
  getCurrentApy(): Promise<number>;      // Dalam persen, e.g. 0.0523 = 5.23%
  getTvl(): Promise<bigint>;            // Total value locked di protocol ini
  getUnderlyingBalance(): Promise<bigint>;
}
```

`src/onchain/contracts/aave-adapter.contract.ts`:
```typescript
@Injectable()
export class AaveAdapterContract implements IStrategyAdapter {
  getProtocolName() { return 'Aave'; }

  async getCurrentApy(): Promise<number> {
    // Baca liquidityIndex & variableBorrowRate dari Aave Pool
    // Hitung APY = (1 + ratePerSecond)^secondsPerYear - 1
    // Ini yang bikin projek lo beda dari yang cuma tampilin data API pihak ketiga!
    return 0.0456; // placeholder, implementasi real di Day 8
  }
}
```

**🧪 Checkpoint:**
- [ ] `AaveAdapterContract.getProtocolName()` return `"Aave"`
- [ ] `CompoundAdapterContract.getProtocolName()` return `"Compound"`
- [ ] Kedua adapter punya method dengan nama & return type yang **identik**

---

### Day 4 — Indexer: Setup Viem Listener

**🎯 Tujuan Hari Ini:**  
Backend bisa "dengerin" event `Deposit` dan `Withdraw` dari blockchain. Belum masukin ke DB — cuma console.log dulu.

**📁 File yang Dibikin:**
```
src/indexer/
├── indexer.module.ts
├── indexer.service.ts
└── listeners/
    ├── deposit.listener.ts
    └── withdraw.listener.ts
```

**🛠️ Perintah CLI:**
```bash
nest g module indexer
nest g service indexer
```

**📝 Isi File Penting:**

`src/indexer/indexer.service.ts`:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { publicClient } from '../config/viem.config';

const VAULT_ABI = [ /* ABI dengan event Deposit & Withdraw */ ] as const;
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as `0x${string}`;

@Injectable()
export class IndexerService implements OnModuleInit {
  onModuleInit() {
    console.log('👂 Indexer mulai dengerin event...');

    publicClient.watchContractEvent({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      eventName: 'Deposit',
      onLogs: (logs) => {
        for (const log of logs) {
          console.log('📥 Deposit detected:', {
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            sender: log.args.sender,
            amount: log.args.assets?.toString(),
          });
        }
      },
    });
  }
}
```

**⚠️ Security Note:**  
- `watchContractEvent` pakai WebSocket biasanya. Kalau RPC lo nggak support WS (banyak RPC gratis nggak support), ganti jadi `watchBlocks` + `getLogs`.

**🧪 Checkpoint:**
- [ ] Jalankan `npm run start:dev`, lalu trigger deposit dari frontend/Foundry
- [ ] Console backend muncul log: `📥 Deposit detected: { ... }`
- [ ] Kalau restart server, listener jalan lagi otomatis (`OnModuleInit`)

---

### Day 5 — Indexer: Simpan ke DB + Idempotency

**🎯 Tujuan Hari Ini:**  
Event yang didengerin masuk ke Postgres. Kalau indexer crash & restart, event yang sama **nggak dobel**.

**📝 Isi File Penting:**

`src/indexer/listeners/deposit.listener.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DepositListener {
  constructor(private prisma: PrismaService) {}

  async handle(log: any) {
    const blockHash = log.blockHash;
    const logIndex = log.logIndex;
    const chainId = parseInt(process.env.CHAIN_ID || '31337');

    // 🛡️ IDEMPOTENCY: Cek dulu, pernah masuk belum?
    const exists = await this.prisma.onChainEvent.findUnique({
      where: {
        blockHash_logIndex_chainId: {
          blockHash,
          logIndex,
          chainId,
        },
      },
    });

    if (exists) {
      console.log('⚠️ Event sudah ada, skip:', blockHash, logIndex);
      return;
    }

    // Simpan baru
    await this.prisma.onChainEvent.create({
      data: {
        blockNumber: BigInt(log.blockNumber),
        blockHash,
        logIndex,
        txHash: log.transactionHash,
        eventType: 'Deposit',
        sender: log.args.sender,
        amount: log.args.assets?.toString(),
        shares: log.args.shares?.toString(),
        chainId,
        isFinalized: false, // ← Belum final, masih bisa reorg
      },
    });

    console.log('✅ Deposit tersimpan ke DB');
  }
}
```

**🧪 Checkpoint (INI PENTING BANGET):**
```bash
# 1. Trigger deposit → cek DB, harus ada 1 row
# 2. Restart server (simulasi crash)
# 3. Trigger deposit lagi (event yang sama, kalau bisa replay block)
# 4. Cek DB, harus tetap 1 row (nggak jadi 2)
```
- [ ] Event masuk ke tabel `OnChainEvent`
- [ ] Restart indexer, event yang sama nggak dobel
- [ ] Query: `SELECT COUNT(*) FROM "OnChainEvent"` → tetap 1

**🚨 Kalau Gagal:**  
Jangan lanjut ke Day 6. Fix idempotency dulu. Ini fondasi indexer — kalau jebol, data lo jadi kacau selamanya.

---

### Day 6 — Indexer: Handle Blockchain Reorg

**🎯 Tujuan Hari Ini:**  
Blockchain bisa "berubah pikiran" (reorg). Block yang udah lo index tiba-tiba invalid. Lo harus tau dan tandai.

**📝 Logika:**
```typescript
// Tiap 12 block (Sepolia) atau 1 block (Anvil), cek ulang
// Kalau blockHash di block number X berubah → REORG!

async checkReorg(blockNumber: bigint) {
  const oldBlock = await this.prisma.onChainEvent.findFirst({
    where: { blockNumber },
  });

  if (!oldBlock) return;

  const currentBlock = await publicClient.getBlock({ blockNumber });

  if (oldBlock.blockHash !== currentBlock.hash) {
    // 🚨 REORG DETECTED!
    await this.prisma.onChainEvent.updateMany({
      where: { blockNumber, chainId },
      data: { isReorged: true },
    });
    console.log('🚨 REORG di block', blockNumber);
  }
}
```

**🧪 Checkpoint:**
- [ ] Simulasi reorg di Anvil (bisa pakai `anvil_reset` atau fork ulang)
- [ ] Event di block reorg ditandai `isReorged = true`
- [ ] Event baru di block pengganti masuk sebagai row baru

---

### Day 7 — Buffer Finalization

**🎯 Tujuan Hari Ini:**  
Event baru dianggap "mentah". Nunggu 12 block baru dianggap "matang" (`isFinalized = true`). UI nggak boleh nampilin data mentah.

**📝 Logika:**
```typescript
// Cron job tiap 30 detik
async finalizeEvents() {
  const currentBlock = await publicClient.getBlockNumber();
  const finalizedBlock = currentBlock - 12n; // 12 block buffer

  await this.prisma.onChainEvent.updateMany({
    where: {
      blockNumber: { lte: finalizedBlock },
      isFinalized: false,
      isReorged: false,
    },
    data: { isFinalized: true },
  });
}
```

**🧪 Minggu 1 Security Checkpoint:**
- [ ] Indexer jalan 1 jam tanpa crash
- [ ] Matiin-nyalain indexer → nggak ada event yang ilang atau dobel
- [ ] Query: `SELECT * FROM "OnChainEvent" WHERE "isReorged" = true` → kosong (kecuali memang ada reorg)
- [ ] Semua event `isFinalized = true` setelah 12 block

**🚨 Kalau Gagal:** Ulang dari Day 4. Jangan lanjut ke Minggu 2.

---

## ⏰ Minggu 2: Worker (APY Calculator + Rebalance Trigger)

> **Tujuan Minggu Ini:** Backend bisa hitung APY **real** dari on-chain data (bukan API pihak ketiga) dan otomatis trigger rebalance kalau selisih APY > 1.5%.

---

### Day 8 — BullMQ Setup + APY Queue

**🎯 Tujuan Hari Ini:**  
Setup antrian kerja. Job "Cek APY" masuk ke antrian dan diproses di background.

**📁 File yang Dibikin:**
```
src/worker/
├── worker.module.ts
├── queues/
│   └── apy.queue.ts
└── processors/
    └── apy-calculator.processor.ts
```

**🛠️ Perintah CLI:**
```bash
nest g module worker
npm install @nestjs/bullmq bullmq
```

**📝 Isi File Penting:**

`src/worker/queues/apy.queue.ts`:
```typescript
import { BullModule } from '@nestjs/bullmq';

export const ApyQueue = BullModule.registerQueue({
  name: 'apy-calculator',
});
```

`src/worker/processors/apy-calculator.processor.ts`:
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('apy-calculator')
export class ApyCalculatorProcessor extends WorkerHost {
  async process(job: Job): Promise<any> {
    console.log('📊 Menghitung APY...', job.id);
    // Implementasi hitung APY real di Day 9
    return { aaveApy: 0.045, compoundApy: 0.038 };
  }
}
```

**🧪 Checkpoint:**
- [ ] Redis jalan (`docker-compose ps` → redis Up)
- [ ] Job masuk ke antrian dan diproses (lihat log)
- [ ] Kalau job gagal, masuk ke "failed jobs" (BullMQ dashboard atau Redis CLI)

---

### Day 9 — Hitung APY Real dari On-Chain

**🎯 Tujuan Hari Ini:**  
Ini **jantung projek lo**. Hitung APY dari data on-chain, bukan dari API CoinGecko/Aave UI.

**📝 Logika (Aave V3):**
```typescript
async calculateAaveApy(): Promise<number> {
  // Baca liquidityRate dari Aave Pool Data Provider
  // Ray = 27 decimals
  const liquidityRate = await publicClient.readContract({
    address: AAVE_POOL_DATA_PROVIDER,
    abi: AAVE_POOL_ABI,
    functionName: 'getReserveData',
    args: [USDC_ADDRESS],
  });

  // liquidityRate adalah RAY (27 decimals)
  // APY = liquidityRate / 10^27 * 100
  const rate = BigInt(liquidityRate[3]); // index liquidityRate
  const apy = Number(rate) / 1e27;

  return apy;
}
```

**⚠️ Security Note:**  
- Jangan percaya data dari 1 RPC aja. Kalau RPC jahat, bisa kasih data palsu.  
- (Opsional tapi recommended) Compare hasil dari 2 RPC berbeda. Kalau beda > 1%, alarm.

**🧪 Checkpoint:**
- [ ] APY Aave yang dihitung **mirip** dengan yang tampil di Aave UI (selisih < 0.5%)
- [ ] APY Compound yang dihitung **mirip** dengan Compound UI
- [ ] Hasil disimpan ke tabel `ApySnapshot`

---

### Day 10 — Rebalance Trigger Logic

**🎯 Tujuan Hari Ini:**  
Bandingkan APY Aave vs Compound. Kalau selisih > 1.5%, masukin job ke antrian `rebalance`.

**📝 Logika:**
```typescript
@Processor('apy-calculator')
export class ApyCalculatorProcessor extends WorkerHost {
  constructor(
    @InjectQueue('rebalance') private rebalanceQueue: Queue,
    private prisma: PrismaService,
  ) {}

  async process(job: Job) {
    const aaveApy = await this.calculateAaveApy();
    const compoundApy = await this.calculateCompoundApy();

    const diff = Math.abs(aaveApy - compoundApy);
    const threshold = 0.015; // 1.5%

    if (diff > threshold) {
      const targetProtocol = aaveApy > compoundApy ? 'Aave' : 'Compound';

      await this.rebalanceQueue.add('trigger', {
        fromProtocol: targetProtocol === 'Aave' ? 'Compound' : 'Aave',
        toProtocol: targetProtocol,
        reason: `APY diff: ${(diff * 100).toFixed(2)}%`,
      });

      console.log('🔄 Rebalance triggered:', targetProtocol);
    }

    // Simpan snapshot
    await this.prisma.apySnapshot.createMany({
      data: [
        { protocol: 'Aave', apy: aaveApy, chainId, blockNumber },
        { protocol: 'Compound', apy: compoundApy, chainId, blockNumber },
      ],
    });
  }
}
```

**🧪 Checkpoint:**
- [ ] Kalau APY beda 2% → job `rebalance` masuk ke antrian
- [ ] Kalau APY beda 0.5% → nggak ada job rebalance
- [ ] Data tersimpan di `ApySnapshot` tiap kali job jalan

---

### Day 11 — Cron Scheduler

**🎯 Tujuan Hari Ini:**  
Job APY jalan otomatis tiap 5 menit. Nggak perlu manual trigger.

**📁 File:** `src/worker/jobs/cron-scheduler.service.ts`

**🛠️ Install:**
```bash
npm install @nestjs/schedule
```

**📝 Logika:**
```typescript
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class CronSchedulerService {
  constructor(@InjectQueue('apy-calculator') private apyQueue: Queue) {}

  @Cron('*/5 * * * *') // Tiap 5 menit
  async handleCron() {
    await this.apyQueue.add('calculate', {
      timestamp: new Date().toISOString(),
    });
    console.log('⏰ Cron triggered: APY calculation');
  }
}
```

**🧪 Checkpoint:**
- [ ] Server jalan 15 menit → job APY jalan 3 kali (cek log)
- [ ] Query DB: `SELECT COUNT(*) FROM "ApySnapshot"` → bertambah tiap 5 menit

---

### Day 12 — TVL Snapshot (Bonus tapi Penting)

**🎯 Tujuan Hari Ini:**  
Simpan Total Value Locked (TVL) historis. Frontend butuh ini buat chart.

**📝 Logika:**
```typescript
// Di dalam processor APY, tambahkan:
const totalAssets = await vaultContract.getTotalAssets();
await this.prisma.tvlSnapshot.create({
  data: {
    totalAssets: totalAssets.toString(),
    totalShares: (await vaultContract.getTotalSupply()).toString(),
    protocol: 'Vault',
    chainId,
    blockNumber,
  },
});
```

**🧪 Minggu 2 Security Checkpoint:**
- [ ] APY dihitung dari on-chain (bukan API pihak ketiga)
- [ ] Rebalance cuma trigger kalau selisih > 1.5%
- [ ] Data `ApySnapshot` dan `TvlSnapshot` bertambah otomatis tiap 5 menit
- [ ] Kalau Redis mati, job nggak hilang (BullMQ persist ke Redis)

---

## ✍️ Minggu 3: Rebalancer + Signer

> **Tujuan Minggu Ini:** Backend bisa eksekusi transaksi `rebalance()` ke blockchain dengan aman — handle nonce, gas, retry, dan jangan pernah expose private key.

---

### Day 13 — Signer Service (The Vault Keeper)

**🎯 Tujuan Hari Ini:**  
Buat service yang bisa tanda tangani transaksi. **Ini adalah kunci kerajaan.**

**📁 File:**
```
src/rebalancer/
├── rebalancer.module.ts
├── rebalancer.service.ts
└── signer/
    └── signer.service.ts
```

**📝 Isi File Penting:**

`src/rebalancer/signer/signer.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { chain } from '../../config/viem.config';

@Injectable()
export class SignerService {
  private account;
  private walletClient;

  constructor() {
    const privateKey = process.env.SIGNER_PRIVATE_KEY as `0x${string}`;

    if (!privateKey || privateKey.length !== 66) {
      throw new Error('❌ SIGNER_PRIVATE_KEY invalid atau kosong!');
    }

    this.account = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(process.env.RPC_URL),
    });

    console.log('🔐 Signer loaded:', this.account.address);
  }

  getAddress(): string {
    return this.account.address;
  }

  getWalletClient() {
    return this.walletClient;
  }
}
```

**⚠️ Security Note (SANGAT PENTING):**
- `SIGNER_PRIVATE_KEY` harus testnet ONLY. Kalau mainnet, ini sama aja titipin dompet ke stranger.
- Jangan pernah log private key. Jangan pernah return private key di API.
- Kalau bisa, pakai AWS KMS / HashiCorp Vault / Azure Key Vault. Tapi untuk portofolio, `.env` masih acceptable asal testnet.

**🧪 Checkpoint:**
- [ ] Server startup → console muncul `🔐 Signer loaded: 0x...`
- [ ] Kalau `SIGNER_PRIVATE_KEY` dihapus dari `.env` → server **crash** saat startup (fail fast)
- [ ] Endpoint (sementara) `GET /rebalancer/signer-address` → return address signer (bukan private key!)

---

### Day 14 — Rebalance Transaction

**🎯 Tujuan Hari Ini:**  
Service bisa kirim transaksi `rebalance()` ke Vault.sol.

**📝 Logika:**
```typescript
// src/rebalancer/rebalancer.service.ts
async executeRebalance(targetProtocol: string) {
  const walletClient = this.signerService.getWalletClient();

  // Estimate gas dulu
  const gasEstimate = await publicClient.estimateContractGas({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'rebalance',
    args: [targetProtocol === 'Aave' ? AAVE_ADAPTER : COMPOUND_ADAPTER],
    account: this.signerService.getAddress() as `0x${string}`,
  });

  // Kirim tx
  const hash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'rebalance',
    args: [targetProtocol === 'Aave' ? AAVE_ADAPTER : COMPOUND_ADAPTER],
    gas: gasEstimate + (gasEstimate / 10n), // +10% buffer gas
  });

  console.log('📤 Rebalance tx sent:', hash);
  return hash;
}
```

**🧪 Checkpoint:**
- [ ] Kalau `rebalance()` dipanggil, tx hash muncul
- [ ] Tx bisa dilihat di Sepolia Etherscan (kalau pakai Sepolia)
- [ ] Gas estimate + 10% buffer (anti stuck karena gas kurang)

---

### Day 15 — Nonce Management + Retry

**🎯 Tujuan Hari Ini:**  
Kalau tx pending lama atau gagal, jangan kirim tx baru dengan nonce yang sama (bisa error) atau beda (bisa double-spend).

**📝 Logika:**
```typescript
async executeRebalanceWithRetry(targetProtocol: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const nonce = await publicClient.getTransactionCount({
        address: this.signerService.getAddress() as `0x${string}`,
      });

      const hash = await this.executeRebalance(targetProtocol);

      // Tunggu receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log('✅ Rebalance sukses');
        return { success: true, hash };
      } else {
        throw new Error('Tx reverted');
      }
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        // Simpan ke DB sebagai failed
        await this.prisma.rebalanceLog.create({
          data: {
            status: 'failed',
            errorMessage: error.message,
            retryCount: maxRetries,
            fromProtocol: '...',
            toProtocol: targetProtocol,
          },
        });
        throw error;
      }

      // Exponential backoff: tunggu 2^attempt detik
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

**🧪 Checkpoint:**
- [ ] Simulasi gagal (misal gas price terlalu rendah) → retry 3x
- [ ] Setelah retry habis, status di DB = `failed`
- [ ] Nonce selalu di-fetch fresh sebelum kirim tx (jangan cache nonce!)

---

### Day 16 — Rebalance Processor (Wiring)

**🎯 Tujuan Hari Ini:**  
Sambungkan antrian `rebalance` dengan `RebalancerService`.

**📁 File:** `src/worker/processors/rebalance-trigger.processor.ts`

**📝 Logika:**
```typescript
@Processor('rebalance')
export class RebalanceTriggerProcessor extends WorkerHost {
  constructor(private rebalancerService: RebalancerService) {}

  async process(job: Job) {
    const { toProtocol } = job.data;
    console.log('🔄 Memproses rebalance ke', toProtocol);

    return this.rebalancerService.executeRebalanceWithRetry(toProtocol);
  }
}
```

**🧪 Minggu 3 Security Checkpoint:**
- [ ] Private key nggak pernah muncul di log, error message, atau API response
- [ ] Tx gagal → tercatat di `RebalanceLog` dengan error message
- [ ] Retry mekanisme jalan (simulasi dengan gas price sengaja dibikin rendah)
- [ ] Nonce selalu fresh (cek dengan `getTransactionCount` sebelum tiap tx)

---

## 📊 Minggu 4: API Layer

> **Tujuan Minggu Ini:** Frontend bisa minta data ke backend via REST API. Data dari DB (bukan query on-chain tiap request — biar cepat).

---

### Day 17 — Vault API: TVL & APY Historis

**📁 File:**
```
src/vault/
├── vault.controller.ts
├── vault.service.ts
└── dto/
    └── tvl-query.dto.ts
```

**📝 Endpoint:**
```typescript
@Controller('vault')
export class VaultController {
  @Get('tvl')
  async getTvlHistory(@Query() query: TvlQueryDto) {
    // Ambil dari DB, bukan query on-chain!
    return this.vaultService.getTvlHistory(query.from, query.to);
  }

  @Get('apy')
  async getApyHistory() {
    return this.vaultService.getApyHistory();
  }
}
```

**🧪 Checkpoint:**
- [ ] `GET /vault/tvl` return array data historis (< 200ms)
- [ ] `GET /vault/apy` return APY Aave & Compound terbaru + historis
- [ ] Kalau DB kosong, return `[]` (bukan error 500)

---

### Day 18 — User API: Posisi Nasabah

**📝 Endpoint:**
```typescript
@Get('user/:address/position')
async getUserPosition(@Param('address') address: string) {
  // Validasi address format
  if (!isAddress(address)) {
    throw new BadRequestException('Address invalid');
  }

  return this.userService.getPosition(address.toLowerCase());
}
```

**🧪 Checkpoint:**
- [ ] `GET /user/0x.../position` return { shares, deposited, withdrawn }
- [ ] Address `0xABC` dan `0xabc` dianggap sama (case insensitive)
- [ ] Address invalid → 400 Bad Request (bukan 500 Internal Server Error)

---

### Day 19 — Event Log API

**📝 Endpoint:**
```typescript
@Get('events')
async getEvents(@Query() query: EventQueryDto) {
  return this.vaultService.getEvents({
    where: {
      eventType: query.type,
      isFinalized: true, // ← UI cuma lihat data final!
      isReorged: false,
    },
    orderBy: { blockNumber: 'desc' },
    take: query.limit || 50,
  });
}
```

**🧪 Checkpoint:**
- [ ] `GET /events?type=Deposit` cuma return event yang `isFinalized = true`
- [ ] Event yang `isReorged = true` nggak muncul di response
- [ ] Pagination jalan (limit & offset)

---

### Day 20 — Rate Limiting + Validasi

**🛠️ Install:**
```bash
npm install @nestjs/throttler
```

**📝 Logika:**
```typescript
// app.module.ts
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'default', ttl: 60000, limit: 100 }, // 100 request/menit
  ],
}),

// vault.controller.ts
@UseGuards(ThrottlerGuard)
@Controller('vault')
export class VaultController {}
```

**🧪 Minggu 4 Security Checkpoint:**
- [ ] Rate limit aktif: 100+ request/menit → 429 Too Many Requests
- [ ] Input address di-validate (bukan string sembarang)
- [ ] Query parameter di-sanitize (SQL injection impossible via Prisma, tapi tetap validasi)
- [ ] Response time < 200ms untuk query historis (karena dari DB, bukan on-chain)

---

## 🧪 Minggu 5: Testing + Hardening

> **Tujuan Minggu Ini:** Cari lubang keamanan sebelum deploy. Simulasi kegagalan, edge case, dan serangan umum.

---

### Day 21 — Unit Test: Indexer Idempotency

**📝 Test:**
```typescript
it('should not create duplicate events on restart', async () => {
  const event = createMockDepositEvent();

  // Proses 2x (simulasi restart)
  await depositListener.handle(event);
  await depositListener.handle(event);

  const count = await prisma.onChainEvent.count();
  expect(count).toBe(1); // Harus tetap 1, bukan 2
});
```

---

### Day 22 — Integration Test: End-to-End Deposit Flow

**📝 Skenario:**
1. Trigger deposit di Anvil
2. Indexer catch event
3. Cek DB → event tersimpan
4. Cek API → event muncul di `GET /events`

---

### Day 23 — Load Test API

**🛠️ Tool:** `autocannon` atau `k6`

**📝 Perintah:**
```bash
npx autocannon -c 50 -d 30 http://localhost:3000/vault/tvl
```

**🎯 Target:**
- [ ] 50 concurrent users → response time < 200ms
- [ ] 0 error rate
- [ ] DB connection nggak leak (cek `pg_stat_activity`)

---

### Day 24 — Security Audit Checklist

**Ceklis Manual:**
- [ ] `grep -r "privateKey\|PRIVATE_KEY" src/` → cuma muncul di `signer.service.ts`
- [ ] `grep -r "console.log" src/` → nggak ada log yang expose data sensitif
- [ ] `grep -r "process.env" src/` → semua env var ada di `.env.example`
- [ ] Coba akses `GET /rebalancer/signer-address` → return address (bukan key!)
- [ ] Coba kirim tx dengan nonce salah → error, bukan tx aneh

---

### Day 25 — Edge Case: Database Connection Drop

**📝 Skenario:**
1. Matiin Postgres (`docker-compose stop postgres`)
2. Indexer jalan → harus retry, bukan crash
3. Nyalain Postgres lagi → indexer auto-recover

**🧪 Minggu 5 Security Checkpoint:**
- [ ] Semua test lolos (`npm run test` → green)
- [ ] Load test lolos (50 concurrent, 0 error)
- [ ] Security audit checklist centang semua
- [ ] Edge case (DB drop, Redis drop) di-handle graceful

---

## 🚀 Minggu 6: Deploy + Dokumentasi

> **Tujuan Minggu Ini:** Orang lain bisa clone repo lo dan jalanin backend dalam 5 menit.

---

### Day 26 — Environment Production

**📁 File:** `.env.production` (jangan commit!)
```env
NODE_ENV="production"
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
RPC_URL="https://eth-sepolia.g.alchemy.com/v2/PRODUCTION_KEY"
SIGNER_PRIVATE_KEY="0x..."
```

---

### Day 27 — Deploy Backend (Railway/Render/Fly.io)

**Railway (Recommended, gratis $5/bulan):**
1. Connect GitHub repo
2. Add PostgreSQL addon
3. Add Redis addon (atau Upstash)
4. Set environment variables
5. Deploy

**🧪 Checkpoint:**
- [ ] `GET https://api-lo.railway.app/health` return 200
- [ ] Indexer jalan di cloud (cek log Railway)
- [ ] Worker jalan (cek Redis queue)

---

### Day 28 — README Lengkap

**Isi README.md backend:**
```markdown
# DeFi Vault Backend

## Quick Start (5 menit)
1. `cp .env.example .env`
2. `docker-compose up -d`
3. `npx prisma migrate dev`
4. `npm install`
5. `npm run start:dev`
6. Cek `http://localhost:3000/health`

## Arsitektur
[Diagram sederhana]

## API Documentation
| Endpoint | Method | Description |
|----------|--------|-------------|
| /health | GET | Health check |
| /vault/tvl | GET | TVL historis |
| /vault/apy | GET | APY historis |
| /user/:addr/position | GET | Posisi user |
| /events | GET | Event log |

## Environment Variables
Lihat `.env.example`

## Testing
- `npm run test` (unit)
- `npm run test:e2e` (integration)
```

---

### Day 29 — Uji Orang Lain

**🎯 Tugas:**  
Minta temen (yang nggak ikut coding) clone repo dan ikutin README.

**🧪 Checkpoint:**
- [ ] Dia bisa jalanin backend dalam 5 menit tanpa nanya lo
- [ ] Kalau stuck, catat di README mana yang kurang jelas → perbaiki

---

### Day 30 — Final Review + Backup

**Ceklis Akhir:**
- [ ] `.env` nggak ke-commit (cek `git log --all --full-history -- .env` → kosong)
- [ ] `.env.example` lengkap
- [ ] `docker-compose.yml` jalan di laptop orang lain
- [ ] Semua secret (private key, API key) cuma di environment variables
- [ ] Backup database production (Railway punya auto-backup, tapi cek!)

---

## 📋 Ringkasan Mingguan

| Minggu | Fokus | Deliverable |
|--------|-------|-------------|
| 1 | Onchain + Indexer | Backend bisa dengerin & catat event blockchain |
| 2 | Worker | APY auto-calculate tiap 5 menit + trigger rebalance |
| 3 | Rebalancer | Tx rebalance jalan dengan retry & nonce management |
| 4 | API | Frontend bisa ambil data historis & posisi user |
| 5 | Testing | Unit test, integration test, load test, security audit |
| 6 | Deploy | Live di cloud + README yang orang lain bisa ikutin |

---

## 🚨 "Jangan Lanjut Sebelum Ini Lolos"

| Gate | Lokasi | Konsekuensi Kalau Skip |
|------|--------|------------------------|
| Idempotency Indexer | Day 5 | Data dobel → TVL/posisi user salah |
| APY On-Chain Real | Day 9 | Data palsu → Rebalance salah target |
| Signer Private Key | Day 13 | Dana testnet hilang → portofolio red flag |
| Retry Mechanism | Day 15 | Tx hilang → vault nggak pernah rebalance |
| Rate Limiting | Day 20 | API di-DDoS → server down |
| Load Test | Day 23 | Deploy → langsung crash pas rame |
| Orang Lain Test | Day 29 | Reviewer stuck → portofolio dianggap nggak runnable |

---

## 💡 Tips Produktivitas

1. **Commit tiap hari** — walau cuma 1 file. History jadi bukti kerja.
2. **Jangan multitask** — 1 hari 1 fokus. Jangan coding indexer sambil mikirin API.
3. **Kalau stuck > 30 menit** — tulis pertanyaan spesifik, istirahat 10 menit, atau tanya.
4. **Test sebelum tidur** — jalanin test, kalau green → tidur tenang.
5. **Jumat = Review mingguan** — cek apa yang lolos, apa yang nggak. Jangan numpuk ke minggu depan.

---

> **"Vertical slice yang selesai > horizontal scope yang setengah jadi."**  
> — Dokumentasi DeFi Vault

Kalau di tengah jalan ada yang terasa berat, **potong scope**. Misal: selesaikan Aave dulu end-to-end (dari indexer sampe rebalance), baru tambah Compound. Jangan bikin 2 adapter sekaligus tapi nggak ada yang jalan.
