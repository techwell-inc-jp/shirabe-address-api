# CLAUDE.md — Shirabe Address API 固有ルール

このファイルは住所 API(`shirabe-address-api`)の固有ルール。
**親フォルダの `../CLAUDE.md`(Shirabe プロジェクト固有) と、
さらにその親 `../../CLAUDE.md`(claude-projects 全体共通)を
先に読んでから、本ファイルを適用すること。**

---

## 1. プロダクト概要

- **プロダクト名**: Shirabe Address API
- **リポジトリ**: `techwell-inc-jp/shirabe-address-api`(Public)
- **公開 URL**: `https://shirabe.dev`(共通ドメイン、`/api/v1/address/*` に振り分け)
- **状態**: 本番稼働準備完了(2026-04-22 時点、Phase 1+2 同時 5/1 正式リリース予定、全 47 都道府県対応)
- **基盤ツール**: abr-geocoder v2.2.1(デジタル庁、MIT)※ v2.5.1 は npm 未公開のため v2.2.1 を採用(packaging 欠陥は subpath import + 型 shim で吸収)
- **データ出典**: アドレス・ベース・レジストリ(デジタル庁、CC BY 4.0 互換)

---

## 2. 参照すべき基準ドキュメント

- **実装指示書(最重要)**: `../shirabe-assets/implementation-orders/20260422-address-api-implementation-order.md`
- **技術検証レポート**: `../shirabe-assets/docs/handoffs/20260420-abr-geocoder-verification.md`
- **PG 移植調査**: `../shirabe-assets/docs/research/20260422-abr-geocoder-search-algorithm-analysis.md`
- **プロジェクト基準**: `../shirabe-assets/docs/project-guideline.md`(v1.03)
- **マスタープラン**: `../shirabe-assets/docs/master-plan.md`(v1.03)
- **KV 設計**: `docs/kv-api-keys-design.md`(本リポジトリ内、1キー集約構造)

---

## 3. 2 層アーキテクチャ

```
AIエージェント / AI SaaS
    ↓ HTTPS
Cloudflare Workers (本リポジトリ src/)
    ├─ 認証・レート制限・KV キャッシュ・Stripe 課金・AE 計測
    └─ Fly.io への内部 POST
         ↓ HTTPS + X-Internal-Token
Fly.io NRT (本リポジトリ fly/)
    └─ abr-geocoder 実体(Node.js 20 + better-sqlite3 + Fly Volumes)
```

### 役割分離原則

- **Workers 側(`src/`)**: 公開 API の全責務(認証・課金・計測・OpenAPI)
- **Fly.io 側(`fly/`)**: abr-geocoder で正規化計算を行う内部サービス、認証は X-Internal-Token のみ

暦 API(`../shirabe-calendar/`)から認証・課金・計測ミドルウェアを移植して Workers 側を構築する。

---

## 4. DB 選定(確定済)

- **SQLite 据え置き**(4/20 検証 + 4/22 PG 調査で結論)
- PostgreSQL + PostGIS は **Phase 1 では採用しない**。必要時は Phase 2 以降に再検討
- 根拠: abr-geocoder は SQLite を KV ストアとして使い、検索はインメモリ Trie。
  DB エンジンを差し替えても検索性能は変わらない

---

## 5. KV API_KEYS(暦 API との共有)

- **1キー集約構造**を採用(本リポジトリ `docs/kv-api-keys-design.md`)
- 旧フォーマット(暦 API 単独時代の flat `plan`)は **読み取り時に自動変換**
- 書き込み(新規発行・Webhook 更新)は **必ず新フォーマット**
- 暦 API 側の `authMiddleware` も同じ変換ロジックを共有する必要あり
  (暦 API 側ミドルウェアの更新は別タスクで実施、Phase 1 骨格時点では未着手)

---

## 6. 料金プラン(暦 API 10 倍)

| プラン | 月間上限 | 単価 | Free枠 | レート制限 |
|---|---|---|---|---|
| Free | 5,000回 | 無料 | 5,000回 | 1 req/s |
| Starter | 200,000回 | ¥0.5/回 | 5,000回 | 30 req/s |
| Pro | 2,000,000回 | ¥0.3/回 | 5,000回 | 100 req/s |
| Enterprise | 無制限 | ¥0.1/回 | 5,000回 | 500 req/s |

Stripe Meter / Price ID は経営者が Stripe ダッシュボードで作成後、
`wrangler secret put` または `wrangler.toml [vars]` で差し込む。

---

## 7. attribution 必須要件

**全レスポンスに `attribution` フィールドを必須化**(実装指示書 §2.1、§6.1)。
- CC BY 4.0 義務履行
- LLM / AI エージェント経由での出典自動伝搬
- スキーマ上 required、CI テストで検証する

既定値は `src/types/address.ts` の `DEFAULT_ATTRIBUTION`。

---

## 8. 禁止事項

親 `../../CLAUDE.md` §0 に加えて、住所 API 固有:

- `wrangler deploy` / `flyctl deploy` のローカル直接実行(**GitHub Actions 経由のみ**)
- attribution フィールドの省略(CC BY 4.0 義務違反)
- 暦 API の既存 244 テストを壊す KV / 認証変更
- 1 対 1 の人間向け施策(住所 API でも絶対ルール 5 を堅持)

---

## 9. Phase 1 実装スケジュール(要旨)

実装指示書 §10 の詳細を参照。

| 日付 | 主要タスク |
|---|---|
| 4/22(火) | リポジトリ新設 + Workers 骨格 + 型定義 |
| 4/23(水) | 暦 API からミドルウェア移植 |
| 4/24(木) | Fly.io Dockerfile + abr-geocoder 統合 + 辞書構築 |
| 4/25(金) | Workers ↔ Fly.io 通信実装 |
| 4/27-28 | 郵便番号パーサ / 建物名分離 / batch / エラー網羅 |
| 4/29-30 | Stripe 課金 + OpenAPI + CI/CD |
| 4/21 経営判断 | Phase 1+2 分離解消 → 全 47 都道府県同時リリースへ前倒し(5/6 → **5/1**)|
| 4/22 完了 | 本番デプロイ準備完了(Workers + Fly.io 両側、PR #1-#9 マージ済)|
| **5/1(木)** | **Phase 1+2 同時正式リリース(全 47 都道府県)** |

---

**親の CLAUDE.md と実装指示書が本ファイルに優先する。矛盾があれば親ルール + §0 セキュリティが絶対優先。**
