// src/prisma/prisma.module.ts
import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // ← Bisa dipakai di semua modul tanpa import module lagi
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule { }