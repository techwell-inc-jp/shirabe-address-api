# Fly.io 用 Dockerfile — shirabe-address-api
#
# abr-geocoder は Node.js >= 20 + better-sqlite3(ネイティブバインディング)依存。
# Phase 1 では主要 6 都道府県の辞書のみを同梱し、起動時に Fly Volumes から
# インメモリ Trie を構築する。
#
# 実装指示書 §4 および shirabe-assets/docs/handoffs/20260420-abr-geocoder-verification.md §3 参照。

# ---- build stage ----
FROM node:20-bookworm-slim AS build

WORKDIR /app

# ネイティブビルド依存(better-sqlite3 用)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        python3 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src
COPY tsconfig.json ./
# TODO(4/24): TS ビルド設定を追加
# RUN npx tsc -p tsconfig.json

# ---- runtime stage ----
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# TODO(4/24): ts-node または ビルド成果物に差し替え
CMD ["node", "--experimental-strip-types", "src/server.ts"]
