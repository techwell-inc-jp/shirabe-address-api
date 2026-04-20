# KV `API_KEYS` 1キー集約構造設計書

**作成日**: 2026-04-22
**担当**: Claude Code
**関連タスク**: 実装指示書 §5.2 タスク4
**対象 namespace**: Cloudflare KV `API_KEYS`(暦 API と共有想定)
**優先順位**: 親 `../../CLAUDE.md` §0 → 本ファイル → 実装指示書 §5.2

---

## 1. 設計目的

1. **同一 API キーで Shirabe の全 API(暦・住所・将来追加分)にアクセス可能**にする
2. プランは **API ごとに独立** に管理(例: 暦 Pro + 住所 Starter)
3. Webhook(Stripe)での更新が **他 API のプラン情報を壊さない** ようにする
4. **既存の暦 API 本番鍵(旧フォーマット)** を無停止で新構造へ移行可能にする

---

## 2. 旧フォーマット(現行、暦 API 単独時代)

KV キー: `<SHA-256(apiKey)>`(64 hex 文字)

KV 値(JSON):

```json
{
  "plan": "pro",
  "customerId": "cus_abc123",
  "stripeCustomerId": "cus_abc123",
  "stripeSubscriptionId": "sub_xyz",
  "email": "user@example.com",
  "status": "active",
  "createdAt": "2026-04-12T10:30:00.000Z"
}
```

問題: `plan` がフラットに置かれており、**暦 API 専用**。住所 API の プラン情報を
追記すると型が不明瞭になる。

---

## 3. 新フォーマット(1キー集約構造)

KV キー: `<SHA-256(apiKey)>`(変更なし)

KV 値(JSON):

```json
{
  "customerId": "cus_abc123",
  "stripeCustomerId": "cus_abc123",
  "email": "user@example.com",
  "createdAt": "2026-04-12T10:30:00.000Z",
  "apis": {
    "calendar": {
      "plan": "pro",
      "status": "active",
      "stripeSubscriptionId": "sub_calendar_xyz",
      "updatedAt": "2026-04-12T10:30:00.000Z"
    },
    "address": {
      "plan": "starter",
      "status": "active",
      "stripeSubscriptionId": "sub_address_abc",
      "updatedAt": "2026-04-22T09:15:00.000Z"
    }
  }
}
```

### 設計原則

- トップレベル: **顧客属性**(customerId / email / createdAt 等、API 横断の識別情報)
- `apis.<apiName>`: **API ごとのプラン状態**(plan / status / stripeSubscriptionId / updatedAt)
- 未契約 API は `apis.<apiName>` 自体を存在させない → 呼び出し側で匿名 Free 扱い

---

## 4. 後方互換性戦略

### 4.1 読み取り時の自動マイグレーション(非破壊)

両 API の認証ミドルウェアは以下のロジックで読み取る:

```ts
import {
  type StoredApiKeyInfo,
  resolveApiPlan,
  isAggregatedApiKeyInfo,
} from "@/types/api-key";

const raw = await c.env.API_KEYS.get(hash);
if (!raw) return 401;
const stored: StoredApiKeyInfo = JSON.parse(raw);

// 旧フォーマットなら暗黙的に calendar 相当にマップされる
const planInfo = resolveApiPlan(stored, "address"); // or "calendar"
if (!planInfo) {
  // 該当 API 未契約 → 匿名 Free 扱い
} else if (planInfo.status === "suspended") {
  return 403;
}
```

**方針**: 読み取りで変換するのみ。KV への書き戻しは **行わない**。
(無用な KV 書込で課金・レート制限に影響しないため、かつ、Webhook 更新が
競合しないため)

### 4.2 書き込み時は必ず新フォーマット

書き込みは以下 3 経路に限定される。いずれも **常に新フォーマット** で書く:

1. **新規 APIキー発行**(`checkout/success` 等):
   - 初回: `apis.<apiName>` のみを持つ新フォーマットで `put`
2. **Stripe Webhook(プラン変更・suspend)**:
   - 既存 KV 値を `get` → 新フォーマットか判定
     - 新フォーマットなら該当 API の `apis.<apiName>` だけ上書き
     - 旧フォーマットなら `migrateToAggregated` でいったん新フォーマット化し、
       該当 API の `apis.<apiName>` を設定して `put`
3. **管理操作**(緊急時の KV 手編集):
   - ガイドラインとして新フォーマットを厳守(暦 API / 住所 API 両対応のため)

### 4.3 完全移行(旧フォーマットの駆逐)

**Phase 1(5/6 リリース時点)では強制移行しない**。既存の暦 API 本番鍵はすべて
旧フォーマットのままで読み取れる。

**Phase 2 以降の候補オプション**(別タスクで決定):
- (a) Webhook 更新時に新フォーマットへ書き替える("on-write migration")
- (b) 夜間バッチで全鍵をスキャンして一括書き替え("offline migration")
- (c) 現状維持(旧フォーマットは永続的に読み取り互換で残す)

→ **推奨: (a)**。自然更新で 1-2 ヶ月で過半数が移行する見込み。

---

## 5. ミドルウェアの責務(暦 API / 住所 API 両方)

### 5.1 住所 API 側(本リポジトリ、4/23 実装予定)

```
X-API-Key ヘッダー
    ↓
SHA-256 ハッシュ化
    ↓
KV.get(hash)
    ↓
StoredApiKeyInfo としてパース
    ↓
resolveApiPlan(stored, "address")
    ↓
┌──────────────────────────────────────────┐
│ a. planInfo なし → 匿名 Free 扱い          │
│ b. planInfo.status === "suspended" → 403  │
│ c. それ以外 → c.set("plan", planInfo.plan) │
└──────────────────────────────────────────┘
```

### 5.2 暦 API 側(`../shirabe-calendar/src/middleware/auth.ts`)

**必要更新**: 既存ミドルウェアは旧フォーマットのフラット `plan` を直接参照。
新フォーマット導入後は `resolveApiPlan(stored, "calendar")` に差し替える。

**重要**: **244 既存テストを壊さないこと**。旧フォーマットの固定値で書かれた
テストは `resolveApiPlan` 経由で同じ結果を返すため、ロジック変更だけでテストは通るはず。

暦 API 側の更新は **別タスク**(4/23-4/24 想定、住所 API の認証ミドルウェア移植と同時)。

---

## 6. Stripe Webhook 互換性

### 6.1 現在の Webhook(暦 API 側)

暦 API 単独時代は `customer.subscription.updated` 等で `plan` フィールドを直接更新。

### 6.2 新 Webhook(両 API 対応)

- Webhook で `metadata.api_name`(`"calendar"` or `"address"`)を **Checkout Session 作成時に設定**
- Webhook 側で `metadata.api_name` を読み取り、該当 API の `apis.<apiName>` のみを更新

Checkout Session 作成例:
```ts
// 住所 API の Checkout 時
await stripe.checkout.sessions.create({
  ...,
  metadata: { api_name: "address", plan: "starter" },
});
```

Webhook 処理例(pseudocode):
```ts
const apiName = event.data.object.metadata.api_name; // "calendar" | "address"
const existing = await API_KEYS.get(hash);
const stored: StoredApiKeyInfo = existing ? JSON.parse(existing) : seedNewRecord();
const aggregated = isAggregatedApiKeyInfo(stored)
  ? stored
  : migrateToAggregated(stored);
aggregated.apis[apiName] = {
  plan: metadata.plan,
  status: subscription.status === "active" ? "active" : "suspended",
  stripeSubscriptionId: subscription.id,
  updatedAt: new Date().toISOString(),
};
await API_KEYS.put(hash, JSON.stringify(aggregated));
```

---

## 7. リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| 暦 API の既存ミドルウェアが新構造でも動くか | 高 | 244 テストパスを CI gate とする |
| 同時書込の競合(暦・住所 Webhook が同時更新) | 中 | KV は最終書き込み勝ち。現実には同一顧客が 2 秒以内に両 API の Stripe イベントを発火する確率は極小。必要なら KV の `If-Match` 等を後日検討 |
| `resolveApiPlan` の型変換バグ | 中 | `src/types/api-key.ts` 側で type guard + 単体テスト(4/23 追加予定) |
| 旧フォーマットのまま放置され、新機能が永続的に未享受 | 低 | Phase 2 で on-write migration を導入予定 |

---

## 8. 本設計書の実装進捗チェックリスト

- [x] 型定義(`src/types/api-key.ts`)— **本日(4/22)完了**
- [ ] 住所 API 側認証ミドルウェア実装(4/23 予定)
- [ ] 暦 API 側 `auth.ts` のリファクタ(`resolveApiPlan` に差し替え、4/23-4/24 予定)
- [ ] 暦 API 244 テストのパス確認(4/24 CI)
- [ ] Stripe Webhook の `metadata.api_name` 対応(住所 API 側 4/29 予定、暦 API 側は同時更新)
- [ ] 経営者確認: KV namespace 共有 or 独立(5.1 の判断)

---

## 9. 要経営者確認事項

1. **KV namespace(API_KEYS)の共有 or 独立**:
   - 共有(推奨): 暦 API の既存 namespace `3b6bfff407974b7cbf79ded8e184c1a6` を住所 API の wrangler.toml にも登録
   - 独立: 住所 API 用に新 namespace を作成、APIキーが別々(ユーザー摩擦増加)
   - **Claude Code 推奨: 共有**。Phase 1 時点では共有が最小工数かつ実装指示書 §5.2 の推奨と整合
2. **旧フォーマットの扱い**: 完全移行タイミング(Phase 2 の on-write migration 採用可否)
