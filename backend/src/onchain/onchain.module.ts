import { Module } from '@nestjs/common';
// import { OnchainService } from './onchain.service.js';
import { AaveAdapterContract } from './contracts/aave-adapter.contracts.js';
import { CompoundAdapterContract } from './contracts/compound-adapter.contracts.js';
// import { VaultContract } from './contracts/vault.contracts.js';

@Module({
    providers: [
        // OnchainService,
        AaveAdapterContract,
        CompoundAdapterContract,
        // VaultContract,
    ],
    exports: [
        // OnchainService,
        AaveAdapterContract,
        CompoundAdapterContract,
        // VaultContract,
    ],
})
export class OnchainModule { }