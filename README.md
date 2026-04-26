# Shirabe Address API

> 日本の住所を AI エージェント向けに**正規化・構造化・出典表記付き**で返す **AI ネイティブ REST API**。全 47 都道府県対応、2026 年 **5 月 1 日** 正式リリース。
> An **AI-native REST API** that **normalizes, structures, and attribution-tags** Japanese addresses for AI agents. Nationwide (all 47 prefectures), launching **May 1, 2026**.

[![Launching v1.0.0](https://img.shields.io/badge/Launching-v1.0.0_(2026--05--01)-blue)](https://github.com/techwell-inc-jp/shirabe-address-api/releases)
[![OpenAPI 3.1](https://img.shields.io/badge/OpenAPI-3.1-6BA539?logo=openapiinitiative&logoColor=white)](https://shirabe.dev/api/v1/address/openapi.yaml)
[![Cloudflare Workers](https://img.shields.io/badge/Edge-Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Fly.io NRT](https://img.shields.io/badge/Geocoder-Fly.io_NRT-8B5CF6?logo=flydotio&logoColor=white)](https://fly.io/)
[![abr-geocoder](https://img.shields.io/badge/Engine-abr--geocoder_v2.2.1-0F766E)](https://github.com/digital-go-jp/abr-geocoder)
[![Data CC BY 4.0](https://img.shields.io/badge/Data-ABR_%7C_CC_BY_4.0-EE5A24)](https://www.digital.go.jp/policies/base_registry_address)
[![Tests](https://img.shields.io/badge/tests-214_passing-brightgreen)](./test)

**Production URL**: `https://shirabe.dev` ・ **OpenAPI 3.1(本家)**: <https://shirabe.dev/api/v1/address/openapi.yaml> ・ **OpenAPI(GPTs 用短縮版)**: <https://shirabe.dev/api/v1/address/openapi-gpts.yaml> ・ **公式サイト**: <https://shirabe.dev>

---

## 目次 / Table of Contents

- [これは何? / What is this?](#これは何--what-is-this)
- [なぜ Shirabe Address か / Why Shirabe Address](#なぜ-shirabe-address-か--why-shirabe-address)
- [クイックスタート(REST)](#クイックスタートrest)
- [AI エージェント統合(GPTs / Claude Tool Use / Function Calling)](#ai-エージェント統合gpts--claude-tool-use--function-calling)
- [エンドポイント一覧](#エンドポイント一覧)
- [レスポンス例](#レスポンス例)
- [attribution(出典表記の自動付与)](#attribution出典表記の自動付与)
- [ユースケース](#ユースケース)
- [料金プラン](#料金プラン)
- [認証とレート制限](#認証とレート制限)
- [エラーハンドリング](#エラーハンドリング)
- [精度と算出根拠 / Accuracy & Data Source](#精度と算出根拠--accuracy--data-source)
- [技術スタック(2 層アーキテクチャ)](#技術スタック2-層アーキテクチャ)
- [ローカル開発](#ローカル開発)
- [ライセンス / License](#ライセンス--license)

---

## これは何? / What is this?

**Shirabe Address API** は、自由記述の日本語住所を、デジタル庁の
[アドレス・ベース・レジストリ(ABR)](https://www.digital.go.jp/policies/base_registry_address)
に基づき **都道府県・市区町村・町丁目・街区・住居番号** に構造化して返す **AI ネイティブ REST API** です。
表記揺れ(全角/半角・新旧字体・京都通り名・札幌条丁目)を吸収し、代表座標・郵便番号・機械可読な
`match_level` と **CC BY 4.0 義務履行のための `attribution` フィールド** を全レスポンスに付与します。

**Shirabe Address API** is an AI-native REST API that normalizes free-form Japanese addresses into
structured components (prefecture, city, town, block, house number) using the Address Base Registry
(ABR) from the Digital Agency of Japan. It handles orthographic variation (full-width/half-width,
kyū-jitai, Kyoto street names, Sapporo grid addresses), returns representative coordinates and
postal codes, a machine-readable `match_level`, and an `attribution` field required on every
response to propagate CC BY 4.0 provenance through LLM pipelines.

### キーワード / Keywords

`日本住所 API` `住所正規化 API` `abr-geocoder API` `地番 API` `町丁目 API` `住居表示 API` `ジオコーディング 日本`
`AI 住所` `LLM address` `japanese address normalization api` `address geocoding japan` `abr api`
`digital agency api` `openapi address api` `gpts actions address` `claude tool use address`
`cloudflare workers address api` `fly.io nrt geocoder` `cc by 4.0 attribution`
`住所表記ゆれ` `address normalization rules` `building name separation` `address api alternative to jusho`
`address api alternative to geolonia` `bodik alternative` `japanese address api comparison`

---

## なぜ Shirabe Address か / Why Shirabe Address

**LLM に住所正規化を直接やらせると、存在しない地名や号レベルを勝手に補完する事故が頻発します。** 住所正規化は「辞書照合問題」であり、LLM が得意とする生成問題ではありません。Shirabe は abr-geocoder(デジタル庁公式、MIT License)の辞書エンジンを API 化し、AI エージェントからは `fetch` 3 行、GPT Builder からは Import URL 1 本で統合できます。

LLMs hallucinate Japanese addresses — inventing house numbers that do not exist, "correcting" town
names into plausible-but-wrong alternatives, and silently reconciling ZIP/address mismatches.
Address normalization is a **dictionary-lookup problem**, not a generation problem. Shirabe wraps
the canonical engine (`abr-geocoder` by the Digital Agency, MIT License) in an API layer so AI
agents can call it with three lines of `fetch`, or one Import URL in GPT Builder.

| 観点 / Aspect | 自前ホスト abr-geocoder / Self-hosted | 他の住所 API / Other APIs | **Shirabe Address** |
|---|---|---|---|
| インフラ / Infra | Fly.io / Cloud Run + Volume 10GB | ○ | ✅ 不要 / zero-ops |
| 辞書更新 / Dict updates | 自前 cron + blue-green | △ | ✅ 常時最新 ABR |
| コールドスタート / Cold start | 数秒〜十数秒 | △ | ✅ なし(エッジ認証) |
| 表記揺れ / Orthographic variation | ◎(本家準拠) | △ | ✅ abr-geocoder 準拠 |
| OpenAPI 3.1 | ✗ | ✗ | ✅ 本家 + GPTs 短縮版 |
| GPTs / Claude Tool Use / Function Calling | 自作 | ✗ | ✅ 1 URL で統合 |
| attribution(CC BY 4.0 自動付与) | 自前実装 | ✗ | ✅ 全レスポンス required |
| Stripe 従量課金 | N/A | ✗ | ✅ Webhook 完全自動 |
| エッジ分散 / Edge distribution | N/A | ✗ | ✅ Cloudflare Workers 全世界 |

---

## クイックスタート(REST)

### 1. まず試す(認証不要、Free 枠 月 5,000 回まで)

```bash
curl -X POST https://shirabe.dev/api/v1/address/normalize \
  -H "Content-Type: application/json" \
  -d '{"address":"東京都千代田区丸の内1-1-1"}'
```

### 2. API キー付き呼び出し

```bash
# 単一住所
curl -X POST https://shirabe.dev/api/v1/address/normalize \
  -H "Content-Type: application/json" \
  -H "X-API-Key: shrb_your_api_key" \
  -d '{"address":"東京都千代田区丸の内1-1-1"}'

# バッチ(最大 100 件)
curl -X POST https://shirabe.dev/api/v1/address/normalize/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: shrb_your_api_key" \
  -d '{"addresses":["東京都港区六本木6-10-1","大阪府大阪市北区梅田1-1-3"]}'
```

### 3. TypeScript / JavaScript

```ts
const res = await fetch("https://shirabe.dev/api/v1/address/normalize", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.SHIRABE_API_KEY!,
  },
  body: JSON.stringify({ address: "東京都千代田区丸の内1-1-1" }),
});
const data = await res.json();
console.log(data.result.normalized);   // "東京都千代田区丸の内一丁目1番1号"
console.log(data.attribution.source);  // "アドレス・ベース・レジストリ(住所データ)"
```

### 4. Python

```python
import json, os, urllib.request

body = json.dumps(
    {"address": "東京都千代田区丸の内1-1-1"},
    ensure_ascii=False,
).encode("utf-8")

req = urllib.request.Request(
    "https://shirabe.dev/api/v1/address/normalize",
    data=body, method="POST",
    headers={
        "Content-Type": "application/json; charset=utf-8",
        "X-API-Key": os.environ["SHIRABE_API_KEY"],
    },
)

with urllib.request.urlopen(req, timeout=10) as r:
    data = json.loads(r.read())
    print(data["result"]["normalized"])
```

### 5. OpenAPI 3.1 仕様から自動生成 / Autogen clients

```bash
# 本家仕様(1000+行、日英併記、x-llm-hint 完備)
curl -O https://shirabe.dev/api/v1/address/openapi.yaml

# TypeScript クライアント生成
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml -g typescript-fetch -o ./client
```

---

## AI エージェント統合(GPTs / Claude Tool Use / Function Calling)

### ChatGPT GPTs Actions(Import URL は **GPTs 用短縮版**)

```
Import URL: https://shirabe.dev/api/v1/address/openapi-gpts.yaml
Authentication: API Key (Header: X-API-Key)
```

本家仕様(1000 行級、日英併記)は GPTs の `description` 300 字制限に抵触するため、
**短縮版 YAML(600 行、各 description ≤ 300 字)を別途配信** しています。`operationId` は本家と完全互換なので、
GPTs で動作確認した後に LangChain / Dify / 自前実装に乗せても挙動が揃います。

### Claude Tool Use / Anthropic SDK

OpenAPI 3.1 を Anthropic SDK の Tool 定義に変換する標準パターン。`attribution` が `required` なので Tool の output schema に必ず含まれ、Claude は応答に出典を自然に含めます。

```ts
import Anthropic from "@anthropic-ai/sdk";
// OpenAPI → Tool 変換は openapi-to-anthropic-tools などのライブラリで自動化可能
```

### Gemini Function Calling / LangChain / LlamaIndex / Dify

OpenAPI Loader で本家 YAML を食わせるだけ。`operationId` がそのまま関数名に、`examples` が in-context サンプルとして使われます。

```python
from langchain_community.agent_toolkits.openapi import OpenAPIToolkit
# requests_wrapper, spec loader を設定すれば住所正規化 tool が自動生成される
```

---

## エンドポイント一覧

全エンドポイントの完全仕様は **[OpenAPI 3.1](https://shirabe.dev/api/v1/address/openapi.yaml)** に定義されています(description、x-llm-hint、example、recoveryHint を日英両言語で記載済み)。

### `POST /api/v1/address/normalize`

単一住所を正規化。

| パラメータ | 位置 | 必須 | 説明 |
|---|---|---|---|
| `address` | body | ✓ | 自由記述の日本語住所(例: `東京都千代田区丸の内1-1-1`) |

### `POST /api/v1/address/normalize/batch`

複数住所を一括正規化(最大 100 件)。

| パラメータ | 位置 | 必須 | 説明 |
|---|---|---|---|
| `addresses` | body | ✓ | 文字列の配列(1〜100 件) |

### `GET /api/v1/address/health`

認証不要のヘルスチェック。`coverage_mode` / `coverage` 配列を返す。

### `GET /api/v1/address/openapi.yaml`

OpenAPI 3.1 本家仕様(日英併記、1000+行)。

### `GET /api/v1/address/openapi-gpts.yaml`

GPTs Actions 用短縮版(日本語のみ、description ≤ 300 字)。

### `/docs/address-normalize` / `/docs/address-batch` / `/docs/address-pricing`

AI クローラー向け SEO 静的ページ(JSON-LD 3 種ブロック入り)。

---

## レスポンス例

### `POST /api/v1/address/normalize` 成功時

```json
{
  "input": "東京都千代田区丸の内1-1-1",
  "result": {
    "normalized": "東京都千代田区丸の内一丁目1番1号",
    "components": {
      "prefecture": "東京都",
      "city": "千代田区",
      "town": "丸の内一丁目",
      "block": "1",
      "building": null,
      "floor": null
    },
    "postal_code": "100-0005",
    "latitude": 35.681236,
    "longitude": 139.767125,
    "level": 4,
    "confidence": 0.98
  },
  "candidates": [],
  "attribution": {
    "source": "アドレス・ベース・レジストリ(住所データ)",
    "provider": "デジタル庁",
    "license": "CC BY 4.0",
    "license_url": "https://creativecommons.org/licenses/by/4.0/"
  }
}
```

### エラー応答例(架空の都道府県)

```json
{
  "input": "ナントカ県ナントカ市1-1-1",
  "error": {
    "code": "OUTSIDE_COVERAGE",
    "message": "ナントカ県 は日本の都道府県として認識できませんでした。入力をご確認ください(全 47 都道府県対応)。",
    "matched_up_to": "ナントカ県",
    "level": 1
  },
  "attribution": { "...": "..." }
}
```

---

## attribution(出典表記の自動付与)

**全レスポンスに `attribution` フィールドが必須で含まれます**(OpenAPI 3.1 の `required` 指定)。
ABR データは CC BY 4.0 互換で **出典表記の義務** があり、LLM 経由で情報が流通しても
出典が伝搬する設計にしています。

```
「アドレス・ベース・レジストリ(住所データ)」(デジタル庁)
```

この仕組みは、GPTs / Claude Tool Use / Function Calling の output schema に `attribution` が構造的に含まれるため、LLM が応答に自然と出典を埋め込みやすくなります。**CC BY 4.0 義務の技術的履行** と **AI 経由出典伝搬**(AI 検索引用経路構築)を同時に実現するのが狙いです。

Every response **always includes an `attribution` object** — required in the OpenAPI schema. This
ensures that when LLMs relay normalized addresses into downstream conversations or training data,
the provenance (Digital Agency / CC BY 4.0) travels with it. This is how we **discharge the CC BY
4.0 attribution obligation programmatically** and **construct AI-citation pathways** simultaneously.

---

## ユースケース

### 1. CRM 住所クレンジング bot

Slack の AI bot に「顧客リストの住所列を正規化して」と投げるだけ。LLM は入出力整形のみ、正規化本体は API に投げる分業で事故を防ぐ。

### 2. 不動産契約書チェック

契約書 PDF から LLM で住所抽出 → 本 API で正規化 → 文字列一致しないケースのみ人手レビュー。LLM 単独の「号レベル勝手補完」事故を止められる。

### 3. 音声入力からの配送先補正

音声認識 → LLM で分かち書き → API で正規化 → `match_level` が `residential` に到達したかで入力完了判定。未達なら不足階層をユーザーに聞き返す。

### 4. GPTs カスタムアクション

Import URL に GPTs 短縮版 YAML を貼るだけで、ChatGPT が住所正規化を自動呼出。既存の暦 GPT と併設可能。

### 5. 業務自動化(RPA / エージェント)

請求書・配送ラベル・契約書の住所を自動正規化。バッチエンドポイントで 100 件同時処理、Stripe 従量課金で使った分だけ支払い。

---

## 料金プラン

全プラン共通で **Free 枠 月 5,000 回**、超過分から課金。`transform_quantity[divide_by]=1000` 方式(暦 API と同じ)。

| プラン / Plan | 月間上限 | 単価(超過分) | 月額例 | レート制限 |
|---|---|---|---|---|
| **Free** | 5,000 回 | 無料 | ¥0 | 1 req/s |
| **Starter** | 200,000 回 | ¥0.5/回 | 20 万回: ¥100,000 | 30 req/s |
| **Pro** | 2,000,000 回 | ¥0.3/回 | 200 万回: ¥600,000 | 100 req/s |
| **Enterprise** | 無制限 | ¥0.1/回 | 1,000 万回: ¥1,000,000 | 500 req/s |

※暦 API の 10 倍単価。住所は AI パイプライン 1 タスクあたり数倍呼ばれる前提の価格設計。

契約・課金・停止・再開はすべて **Stripe Webhook で自動処理**(人間オペ不要、AI ネイティブ運用)。

---

## 認証とレート制限

### API キー

`X-API-Key` ヘッダーに `shrb_` + 32 文字のキー:

```
X-API-Key: shrb_a1b2c3d4e5f67890...
```

キーなしは匿名 Free 枠(IP 別 月 5,000 回)で動作。**暦 API と同じ KV で API キーを共有**(1 キー集約構造、`apis.address` / `apis.calendar` を 1 キーで管理)。

### レート制限ヘッダー

全レスポンスに付与:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 2026-05-01T12:00:01Z
X-Plan: starter
```

---

## エラーハンドリング

全エラーは共通形 `{ input, error: { code, message, matched_up_to?, level? }, attribution }`。

| HTTP | `code` | 復旧アクション |
|---|---|---|
| 200 | `OUTSIDE_COVERAGE` | `matched_up_to` 以降を修正して再送(架空県・タイポ) |
| 200 | `PREFECTURE_NOT_FOUND` | 都道府県表記を確認 |
| 200 | `PARTIAL_MATCH` | 市区町村・町丁目のどこかで辞書ヒットせず。`level` を確認 |
| 200 | `ADDRESS_NOT_FOUND` | 住所全体が辞書にない、または異常入力 |
| 400 | `INVALID_FORMAT` | body 形式を仕様通り修正 |
| 400 | `BATCH_TOO_LARGE` | `addresses` を 100 件以下に分割 |
| 401 | `INVALID_API_KEY` | キー更新、またはヘッダー削除で Free 枠利用 |
| 429 | `RATE_LIMIT_EXCEEDED` | `Retry-After` 秒後に再送、または上位プラン |
| 503 | `SERVICE_UNAVAILABLE` | 指数バックオフで再試行。恒常的なら support@shirabe.dev |

詳細は OpenAPI 仕様の `ErrorCode` セクションを参照。

---

## 精度と算出根拠 / Accuracy & Data Source

- **辞書エンジン**: [`@digital-go-jp/abr-geocoder`](https://github.com/digital-go-jp/abr-geocoder) v2.2.1(MIT License、デジタル庁公式)
- **辞書データ**: アドレス・ベース・レジストリ(ABR、デジタル庁、CC BY 4.0)
- **対応範囲**: 全 47 都道府県(`coverage_mode: "nationwide"`)
- **match_level**: 0(一致なし) / 1(都道府県) / 2(市区町村) / 3(町丁目) / 4(番地・号レベル)
- **代表座標**: 街区レベルの代表点(ABR 提供)
- **テスト**: 198 tests passing(`test/` 配下)

### 表記ゆれ補正の 4 ルール / Address Normalization Rules

abr-geocoder 準拠で以下の表記ゆれを構造的に吸収します:

1. **漢数字 → 算用数字**: 「一丁目」→「1 丁目」、「三十二番地」→「32 番地」
2. **全角 → 半角統一**: 「1 - 2 - 3」(全角ハイフン)→ 「1-2-3」(半角)、「ABC ビル」→ 「ABC ビル」
3. **接続詞統一**: 「ノ」「之」「の」を「丁目・番地」セパレータとして正規化(例「一ノ二」→「1-2」)
4. **建物名と地番の切り分け**: 「東京都港区六本木 6-10-1 六本木ヒルズ森タワー 5 階」→ `block: "6-10-1"`, `building: "六本木ヒルズ森タワー"`, `floor: "5 階"` を分離

加えて、**新旧字体**(舊/旧)、**京都通り名**(四条河原町、寺町通り等)、**札幌条丁目**(南 1 条西 4 丁目)、**IVS**(異体字セレクタ)も abr-geocoder の辞書照合で吸収。

The API normalizes orthographic variation through four structural rules: (1) **kanji → arabic numerals**, (2) **full-width → half-width**, (3) **separator unification** (ノ/之/の → hyphen), and (4) **building name vs. block separation** (returned as distinct `building` / `floor` fields). Built on abr-geocoder's dictionary engine for additional coverage of *kyū-jitai*, Kyoto street names, Sapporo grid addresses, and IVS variants.

The Digital Agency's reference implementation defines the canonical behavior for these rules.

The API uses the canonical ABR data and the official `abr-geocoder` engine, so behavior matches the
Digital Agency's reference implementation for orthographic variants, Kyoto street names, Sapporo
grid addresses, and IVS.

---

## 技術スタック(2 層アーキテクチャ)

abr-geocoder は Node.js + better-sqlite3(ネイティブモジュール)依存で Cloudflare Workers に直接は乗りません。そのため **公開面はエッジ、計算本体は Fly.io NRT** の 2 層構成を採用しています。

```
AI エージェント(ChatGPT / Claude / Gemini / LangChain)
  │
  ↓ HTTPS (shirabe.dev)
Cloudflare Workers (エッジ、全世界)
  ├─ X-API-Key 認証 / レート制限 / KV キャッシュ
  ├─ Stripe Billing メーター連携
  ├─ OpenAPI 3.1 配信(本家 + GPTs 短縮版)
  ├─ /docs/* AI クローラー向け静的ページ
  └─ /internal/geocode POST (X-Internal-Token)
       │
       ↓ 内部認証
Fly.io NRT (東京、performance-1x)
  ├─ Volume `address_db` 20GB
  ├─ abr-geocoder v2.2.1
  ├─ common.sqlite (~3GB、ABR 全国辞書)
  └─ インメモリ Trie (47 都道府県)
```

### 使用技術

- **エッジ**: Cloudflare Workers / Hono / Wrangler
- **言語**: TypeScript(strict mode)
- **課金**: Stripe Billing(従量課金メーター + `transform_quantity`)
- **KV**: Cloudflare KV(API キー・レート制限・住所キャッシュ)
- **計測**: Cloudflare Analytics Engine(AI クローラー UA 分類、AI 検索 Referrer 分類)
- **コア**: `@digital-go-jp/abr-geocoder` v2.2.1(MIT License)
- **Fly.io 側ランタイム**: Node.js 20 + better-sqlite3(Dockerfile multi-stage build)
- **テスト**: Vitest(198 tests passing)
- **CI/CD**: GitHub Actions(test → deploy-workers + deploy-fly 並列発火)
- **監視**: BetterStack

---

## ローカル開発

```bash
# 依存関係
npm install

# Workers 側開発(Wrangler、http://localhost:8787)
npm run dev

# Fly.io 側開発(fly/ 配下)
cd fly && npm install && npm run build && npm start

# テスト
npm test              # 198 tests
npm run typecheck     # tsc --noEmit

# OpenAPI 仕様検証
npm run validate:openapi
```

**デプロイは GitHub Actions 経由のみ**(`wrangler deploy` / `flyctl deploy` のローカル直接実行は禁止)。

### 辞書構築(Fly.io 初回のみ)

```bash
flyctl ssh console -a shirabe-address-api
bash /app/scripts/build-dictionary.sh
# 全国フル辞書ダウンロード(~3GB、構築 2-3h)
```

---

## プロジェクトの設計思想(AI ネイティブ API)

Shirabe Address API は **「生成 AI が勝手に使い出す」** ことを判断基準に設計されています。

1. **AI が主利用者**: 1 タスクで 10〜50 リクエストを連鎖する前提の設計。
2. **構造化データ優先**: OpenAPI 3.1(本家 + GPTs 短縮版)、`attribution` required、`match_level` 機械可読。
3. **人間向け SaaS 発想の排除**: サインアップ画面なし、ダッシュボードなし、設定画面なし。すべて API / 環境変数で完結。
4. **自動スケール**: 契約・課金・停止・復帰を Stripe Webhook で完全自動化。

This is an AI-native API: designed to be discovered and consumed by LLMs and autonomous agents, not by humans through a dashboard UI.

---

## AI ごとの認識される位置付け / How Different AIs Discover This API

2026 年 4 月の社内測定で、4 大 AI(ChatGPT / Claude / Perplexity / Gemini)に同じ質問「福岡市の住所正規化 API」を投げた結果、推奨される競合 API が AI ごとに大きく異なることが判明しました。Shirabe Address API は **4 AI 全てに対する dual-track positioning** を採用しています。

| AI | 主敵(その AI が推奨する API)| Shirabe の差別化軸 |
|---|---|---|
| **ChatGPT** | Jusho(api.jusho.dev) | OpenAPI 3.1 + GPTs Actions Import URL 完備、Free 枠 + 段階的 Pricing |
| **Perplexity** | BODIK ODCS / Geolonia | 自治体公式以上の精度 + AI ネイティブ統合 + GitHub 公開 |
| **Claude** | Yahoo!ジオコーダ / Google Maps Geocoding | Claude Tool Use 直接統合 + attribution required |
| **Gemini** | Google Maps Geocoding / ZENRIN Maps API | abr-geocoder(デジタル庁公式)直結 + 表記ゆれ補正 4 ルール明示 |

In April 2026 we measured how four major AIs (ChatGPT, Claude, Perplexity, Gemini) recommend address normalization APIs for Japanese addresses. The competitor each AI surfaces differs sharply by AI — ChatGPT favors Jusho, Perplexity surfaces BODIK + Geolonia, Claude lists Yahoo / Google Maps, Gemini foregrounds Google Maps + ZENRIN. Shirabe Address API is positioned for discoverability across all four AIs, not a single one.

---

## ライセンス / License

- **API サービス本体**: Proprietary(商用利用は有料プランに従う)
- **本リポジトリのソースコード**: MIT
- **abr-geocoder**: MIT License, Copyright (c) 2024 デジタル庁
- **辞書データ(ABR)**: CC BY 4.0 互換(出典表記必須、本 API の `attribution` で自動付与)
- **利用規約**: <https://shirabe.dev/terms>
- **連絡先**: <support@shirabe.dev>

---

## 関連リンク / Related Links

- **本番 API**: <https://shirabe.dev>
- **OpenAPI 3.1 本家**: <https://shirabe.dev/api/v1/address/openapi.yaml>
- **OpenAPI 3.1 GPTs 用**: <https://shirabe.dev/api/v1/address/openapi-gpts.yaml>
- **住所正規化ガイド**: <https://shirabe.dev/docs/address-normalize>
- **バッチ正規化ガイド**: <https://shirabe.dev/docs/address-batch>
- **料金プラン**: <https://shirabe.dev/docs/address-pricing>
- **ヘルスチェック**: <https://shirabe.dev/api/v1/address/health>
- **姉妹 API(暦 API)**: <https://github.com/techwell-inc-jp/shirabe-calendar-api>
- **abr-geocoder(公式)**: <https://github.com/digital-go-jp/abr-geocoder>
- **アドレス・ベース・レジストリ(デジタル庁)**: <https://www.digital.go.jp/policies/base_registry_address>
- **運営**: 株式会社テックウェル(福岡)/ Techwell Inc., Fukuoka, Japan

---

<!--
  JSON-LD structured data for AI crawlers and search engines.
  Visible to GitHub's content indexers and LLM training crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, anthropic-ai, etc.)
-->
<details>
<summary>Structured data (JSON-LD for AI crawlers)</summary>

```json
{
  "@context": "https://schema.org",
  "@type": "APIReference",
  "name": "Shirabe Address API",
  "description": "AI-native REST API for Japanese address normalization. Uses the Address Base Registry (ABR, Digital Agency of Japan, CC BY 4.0) via the official abr-geocoder engine. Returns structured components, representative coordinates, postal code, and an attribution field required on every response for CC BY 4.0 compliance and LLM-citation propagation. Nationwide coverage (all 47 prefectures), launching 2026-05-01.",
  "url": "https://shirabe.dev",
  "documentation": "https://shirabe.dev/api/v1/address/openapi.yaml",
  "programmingModel": "REST",
  "datePublished": "2026-05-01",
  "targetProduct": {
    "@type": "SoftwareApplication",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Cross-platform"
  },
  "provider": {
    "@type": "Organization",
    "name": "Techwell Inc.",
    "address": "Fukuoka, Japan",
    "url": "https://shirabe.dev"
  },
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "isBasedOn": {
    "@type": "Dataset",
    "name": "Address Base Registry",
    "creator": {
      "@type": "Organization",
      "name": "Digital Agency of Japan"
    },
    "license": "https://creativecommons.org/licenses/by/4.0/"
  },
  "keywords": [
    "japanese address api", "address normalization", "abr-geocoder",
    "digital agency japan", "address base registry", "地番",
    "町丁目", "住居表示", "住所正規化", "ジオコーディング 日本",
    "openapi 3.1", "gpts actions", "claude tool use",
    "function calling", "ai-native api", "cloudflare workers",
    "fly.io nrt", "cc by 4.0 attribution"
  ]
}
```

</details>
