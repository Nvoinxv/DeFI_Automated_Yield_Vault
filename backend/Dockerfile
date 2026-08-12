# =============================================================================
# 🐳 Dockerfile — DeFi Vault Backend (NestJS 11 + Prisma + BullMQ)
# =============================================================================
# Cara pakai:
#   docker build -t defi-vault-backend .
#   docker run -p 3000:3000 --env-file .env defi-vault-backend
#
# Multi-stage build: image akhir cuma ~150MB (bukan 1GB+)
# =============================================================================

# =============================================================================
# STAGE 1: Base Dependencies
# =============================================================================
FROM node:20-alpine AS deps

# Install tools yang dibutuhkan Prisma (native binaries)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy dulu package files (layer caching — kalau package.json nggak berubah,
# Docker nggak perlu npm install ulang)
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/

# Install SEMUA dependency (dev + prod — butuh buat build TypeScript)
RUN npm ci

# Generate Prisma Client (butuh schema.prisma)
RUN npx prisma generate

# =============================================================================
# STAGE 2: Builder (Compile TypeScript → JavaScript)
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency dari stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/package*.json ./

# Copy source code
COPY . .

# Build NestJS (hasil di folder dist/)
RUN npm run build

# =============================================================================
# STAGE 3: Production (Image final — kecil & aman)
# =============================================================================
FROM node:20-alpine AS production

# Install curl buat healthcheck (image alpine nggak punya curl default)
RUN apk add --no-cache curl

# 🛡️ SECURITY: Jangan run sebagai root!
# Buat user khusus dengan UID/GID 1001 (bukan 0/root)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

WORKDIR /app

# Copy hasil build dari stage builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Generate Prisma Client lagi di stage production
# (karena binary Prisma beda-beda tergantung OS host)
RUN npx prisma generate

# 🛡️ Hapus dev dependencies biar image lebih kecil
RUN npm prune --production

# 🛡️ Bersihkan cache npm (nggak butuh di production)
RUN npm cache clean --force
RUN rm -rf /tmp/*

# Ganti ke user non-root
USER nestjs

# Port yang dipakai app (harus sama dengan PORT di .env)
EXPOSE 3000

# 🩺 Healthcheck: cek /health tiap 30 detik
# Kalau gagal 3x berturut-turut, Docker tandai container sebagai "unhealthy"
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 🚀 Jalankan aplikasi
# "node dist/main" lebih cepat daripada "npm run start:prod"
# (nggak perlu overhead npm/scripts)
CMD ["node", "dist/main"]