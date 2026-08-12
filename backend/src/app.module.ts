// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
    imports: [
        // 1. Env validation (kalau .env kosong, app langsung nangis & mati)
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),

        // 2. Redis/BullMQ connection
        BullModule.forRoot({
            connection: {
                url: process.env.REDIS_URL,
            },
        }),

        // 3. Database (Global)
        PrismaModule,

        // 4. Health check (biar tau server hidup)
        HealthModule,

        // TODO: Modul lain ditambah bertahap:
        // OnchainModule,
        // IndexerModule,
        // WorkerModule,
        // RebalancerModule,
        // VaultModule,
        // UserModule,
    ],
})
export class AppModule { }