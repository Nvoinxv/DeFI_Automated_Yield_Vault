import { Module } from '@nestjs/common';
import { OnchainService } from './onchain.service';
import { AaveAdapterContract } from './contracts/aave-adapter.contracts';
import { CompoundAdapterContract } from './contracts/compound-adapter.contracts';
import { VaultContract } from './contracts/vault.contracts';

@Module({
    providers: [
        OnchainService,
        AaveAdapterContract,
        CompoundAdapterContract,
        VaultContract,
    ],
    exports: [
        OnchainService,
        AaveAdapterContract,
        CompoundAdapterContract,
        VaultContract,
    ],
})
export class OnchainModule { }