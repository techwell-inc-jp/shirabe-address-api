# Shirabe Address API

> 日本の住所を AI エージェント向けに正規化・構造化・座標付与する REST API(Phase 1 骨格)。

Shirabe(shirabe.dev)シリーズの住所 API です。abr-geocoder(デジタル庁提供、MIT License)を
基盤に、Cloudflare Workers(エッジ認証・課金)+ Fly.io NRT(abr-geocoder 実体)の 2 層構成で
稼働します。

Phase 1(5/3-4 デプロイ可能、5/6 正式リリース予定)では東京都・神奈川県・大阪府・愛知県・
福岡県・北海道の 6 都道府県を対象とします。Phase 2(5/20 頃)で全国展開予定。

## 主要エンドポイント(予定)

| メソッド | パス | 認証 | 用途 |
|---|---|---|---|
| `POST` | `/api/v1/address/normalize` | X-API-Key(任意、匿名 Free) | 単一住所の正規化 |
| `POST` | `/api/v1/address/normalize/batch` | 同上 | 複数住所(最大 100 件)の一括正規化 |
| `GET` | `/api/v1/address/health` | 不要 | ヘルスチェック |
| `GET` | `/api/v1/address/openapi.yaml` | 不要 | OpenAPI 3.1 仕様配信 |

詳細は `implementation-orders/20260422-address-api-implementation-order.md`(shirabe-assets リポジトリ)
を参照。

## データ出典 / Data Attribution

本 API は「アドレス・ベース・レジストリ(住所データ)」(デジタル庁)を加工して作成しています。
This API processes the Address Base Registry (CC BY 4.0) provided by the Digital Agency, Government of Japan.

全レスポンスには `attribution` フィールドが含まれ、LLM / AI エージェント経由でも出典が
自動的に引き継がれるよう設計されています(CC BY 4.0 の義務履行 + AI 引用経路構築)。

## 開発

```bash
npm install
npm run dev         # Wrangler でローカル起動(http://localhost:8787)
npm test            # Vitest
npm run typecheck   # tsc --noEmit
```

**デプロイは GitHub Actions 経由のみ**です(`wrangler deploy` / `flyctl deploy` 直接実行は禁止)。

## ライセンス

MIT License(本リポジトリのソースコード)。
abr-geocoder 本体も MIT(Copyright (c) 2024 デジタル庁)。
ABR データは CC BY 4.0 互換(出典表記必須)。
