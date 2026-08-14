import { AaveAdapterContract } from './onchain/contracts/aave-adapter.contracts.js';
import { publicClient } from './config/viem.config.js';

async function main() {
  console.log("=========================================");
  console.log("🧪 TESTING AAVE ADAPTER CONTRACT");
  console.log("=========================================\n");

  try {
    // Gunakan alamat dummy untuk testing (karena belum deploy di testnet)
    const DUMMY_ADDRESS = '0x1111111111111111111111111111111111111111';
    
    console.log(`Menginisialisasi AaveAdapterContract di alamat: ${DUMMY_ADDRESS}...`);
    
    const aaveAdapter = new AaveAdapterContract(DUMMY_ADDRESS, publicClient);
    
    console.log("\n✅ Berhasil membuat instance dari AaveAdapterContract!");
    console.log("Method yang tersedia di AaveAdapterContract:", Object.getOwnPropertyNames(Object.getPrototypeOf(aaveAdapter)).filter(m => m !== 'constructor'));

    console.log("\nMencoba mensimulasikan pemanggilan isActive()...");
    
    // Ini akan error atau me-return false/0 tergantung RPC (karena alamat dummy)
    // Tapi akan membuktikan bahwa koneksi RPC dan viem client sudah berjalan.
    const active = await aaveAdapter.isActive().catch(e => {
        console.log(`\n⚠️ (Wajar error karena alamat ${DUMMY_ADDRESS} bukan kontrak sungguhan di chain)`);
        console.log(`Pesan Error RPC: ${e.shortMessage || e.message}`);
        return "Simulasi Selesai";
    });

  } catch (error) {
    console.error("Terjadi kesalahan:", error);
  }
}

main();
