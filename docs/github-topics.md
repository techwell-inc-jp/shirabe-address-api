# GitHub Topics 設定(shirabe-address-api、20 件)

**対象リポジトリ**: <https://github.com/techwell-inc-jp/shirabe-address-api>
**設定方法**: Web UI(About 歯車 → Topics)または `gh repo edit` コマンド
**目的**: B-3 テンプレ(AI クローラー流入 + 開発者検索流入)。暦 API との命名整合性を維持しつつ、住所ドメイン固有の topic で discoverability を拡張する。

---

## 設定一覧(20 件、全て GitHub Topics 規約準拠の lowercase + hyphen)

| # | topic | カテゴリ | 狙い / 検索語との合致 |
|---|---|---|---|
| 1 | `japanese-address` | ドメイン | 「japanese address API」「日本住所」の英語検索 |
| 2 | `address-normalization` | 機能 | 「address normalization」「住所正規化」の主要検索語 |
| 3 | `address-geocoding` | 機能 | 「geocoding japan」「ジオコーディング」の検索語 |
| 4 | `abr-geocoder` | 基盤 | デジタル庁公式ツール名、abr-geocoder 周辺の検索流入 |
| 5 | `address-base-registry` | データ出典 | ABR 正式名、政府データ文脈の検索 |
| 6 | `digital-agency-japan` | データ出典 | デジタル庁プロジェクト文脈 |
| 7 | `openapi-3-1` | 仕様 | OpenAPI 3.1 の検索、AI エージェント統合文脈 |
| 8 | `ai-native-api` | 設計思想 | Shirabe 全体共通 topic、暦 API と整合 |
| 9 | `gpts-actions` | AI 統合 | ChatGPT GPTs Actions 統合事例の検索 |
| 10 | `claude-tool-use` | AI 統合 | Anthropic Tool Use 統合事例の検索 |
| 11 | `function-calling` | AI 統合 | Gemini / OpenAI Function Calling の汎用検索 |
| 12 | `llm-tools` | AI 統合 | LLM 用ツール全般の検索 |
| 13 | `cloudflare-workers` | 技術 | エッジ実行基盤、Workers エコシステム検索流入 |
| 14 | `fly-io` | 技術 | Fly.io エコシステム検索流入(NRT / Volume / Docker) |
| 15 | `hono` | 技術 | Hono フレームワーク検索流入 |
| 16 | `stripe-billing` | 技術 | 従量課金実装の検索流入 |
| 17 | `typescript` | 技術 | TypeScript エコシステム広域 |
| 18 | `cc-by-4` | ライセンス | CC BY 4.0 実装事例の検索(attribution 自動付与) |
| 19 | `rest-api` | 汎用 | REST API 広域検索 |
| 20 | `japan-api` | 汎用 | 「japan api」広域検索、姉妹 API(暦)と同一 topic で相互発見性向上 |

---

## 設定方法

### 方法 A: Web UI(推奨、経営者向け)

1. <https://github.com/techwell-inc-jp/shirabe-address-api> を開く
2. 右側 **About** セクションの歯車アイコン
3. **Topics** 欄に以下を 1 つずつ追加(スペースキー または Enter で確定):

```
japanese-address
address-normalization
address-geocoding
abr-geocoder
address-base-registry
digital-agency-japan
openapi-3-1
ai-native-api
gpts-actions
claude-tool-use
function-calling
llm-tools
cloudflare-workers
fly-io
hono
stripe-billing
typescript
cc-by-4
rest-api
japan-api
```

4. **Save changes** で確定

### 方法 B: `gh repo edit` コマンド(Claude Code でも可、一括設定)

```bash
gh repo edit techwell-inc-jp/shirabe-address-api \
  --add-topic japanese-address \
  --add-topic address-normalization \
  --add-topic address-geocoding \
  --add-topic abr-geocoder \
  --add-topic address-base-registry \
  --add-topic digital-agency-japan \
  --add-topic openapi-3-1 \
  --add-topic ai-native-api \
  --add-topic gpts-actions \
  --add-topic claude-tool-use \
  --add-topic function-calling \
  --add-topic llm-tools \
  --add-topic cloudflare-workers \
  --add-topic fly-io \
  --add-topic hono \
  --add-topic stripe-billing \
  --add-topic typescript \
  --add-topic cc-by-4 \
  --add-topic rest-api \
  --add-topic japan-api
```

---

## 暦 API(shirabe-calendar-api)との比較

| 用途 | 暦 API(設定済 20 件)| 住所 API(本リスト) |
|---|---|---|
| 共通: AI ネイティブ設計 | `ai-native-api` | `ai-native-api` ✅ |
| 共通: 日本ドメイン | `japan-api` | `japan-api` ✅ |
| 共通: OpenAPI | `openapi-3-1` | `openapi-3-1` ✅ |
| 共通: Cloudflare Workers | `cloudflare-workers` | `cloudflare-workers` ✅ |
| 共通: GPTs 統合 | `gpts-actions` | `gpts-actions` ✅ |
| 共通: Claude Tool Use | `claude-tool-use` | `claude-tool-use` ✅ |
| 共通: Function Calling | `function-calling` | `function-calling` ✅ |
| 共通: LLM tools | `llm-tools` | `llm-tools` ✅ |
| 共通: Hono | `hono` | `hono` ✅ |
| 共通: Stripe | `stripe-billing` | `stripe-billing` ✅ |
| 共通: TypeScript | `typescript` | `typescript` ✅ |
| 共通: REST API | `rest-api` | `rest-api` ✅ |
| 暦固有 | `rokuyo-api` `rekichu` `lunar-calendar` `kanshi` `japanese-calendar` `mcp-server` `auspicious-days` `wedding-dates` | — |
| 住所固有 | — | `japanese-address` `address-normalization` `address-geocoding` `abr-geocoder` `address-base-registry` `digital-agency-japan` `fly-io` `cc-by-4` |

12 件共通 + 各 API 固有 8 件の構成で、**Shirabe シリーズ間の相互発見** と **各 API ドメイン固有検索** の両立を狙います。

---

## AI クローラー視点での効果(B-3 仮説)

GitHub は GPTBot / ClaudeBot / PerplexityBot / Google-Extended / anthropic-ai など主要 AI クローラーに対して **robots.txt でブロックしていない**(2026 年時点)。Topics は GitHub のトピック一覧ページや検索 API 経由で AI クローラーに取得される。

| クローラー | 想定流入経路 |
|---|---|
| GPTBot / ClaudeBot | Topics 一覧ページ `https://github.com/topics/japanese-address` 経由で本 repo を発見、README(日英併記 + JSON-LD)を取得 |
| PerplexityBot | 「住所正規化 API」「japanese address api」検索クエリに対して、Topics で揃えた repo 群が Perplexity の AI Answer のソースになる |
| Google-Extended | Gemini の訓練データに README が入る経路、Topics で repo 単位の discoverability が上がる |

B-3 仮説の計測(AE dataset `shirabe_address_events` の AI クローラー流入数)で 5/8 中間判定時に効果検証予定。

---

## 注意事項

- GitHub Topics は **1 repo あたり最大 20 件**。本リストはギリギリ 20 件
- **lowercase + hyphen** のみ許可(大文字・アンダースコア・ドット不可)。`openapi-3-1` は `.` が使えないためハイフンで表現
- 追加後すぐに検索インデックスに反映されるわけではなく、数日〜1 週間のタイムラグあり
- 設定後、`/about` セクションに Topics が表示されることを確認

---

**対応予定日**: 4/24-25(経営者タスク、handoff 20260426.md の「明日以降のタスク」に記載済)
