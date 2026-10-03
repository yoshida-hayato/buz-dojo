# Stripe 決済セットアップ（ビジネス道場）

## 前提（完了済み）

- [x] Firebase Auth 有効化
- [x] Firebase Blaze プラン
- [x] Firestore ルールデプロイ
- [x] Stripe シークレット登録（Firebase Secrets）
- [x] Cloud Functions デプロイ
- [x] Stripe Webhook 登録

**Webhook URL:** `https://asia-northeast1-buz-dojo.cloudfunctions.net/stripeWebhook`

## 1. Stripe ダッシュボード

1. [Stripe Dashboard](https://dashboard.stripe.com/) でアカウント作成
2. **テストモード**で開発 → 本番切替は Live モードキーに差し替え
3. **Customer Portal** を有効化  
   Settings → Billing → Customer portal → 有効化（解約・カード変更を許可）

## 2. Firebase シークレット

プロジェクト `buz-dojo` で以下を登録します。

```bash
cd "ビジネス道場"

# Stripe シークレットキー（sk_test_... または sk_live_...）
firebase functions:secrets:set STRIPE_SECRET_KEY --project buz-dojo

# Webhook 署名シークレット（whsec_...）— 手順3のあと
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project buz-dojo
```

## 3. Cloud Functions デプロイ

```bash
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules,hosting --project buz-dojo
```

デプロイ後、Functions の URL を確認:

```bash
firebase functions:list --project buz-dojo
```

`stripeWebhook` の URL 例:

`https://asia-northeast1-buz-dojo.cloudfunctions.net/stripeWebhook`

## 4. Stripe Webhook 登録

Stripe Dashboard → Developers → Webhooks → Add endpoint

- **Endpoint URL:** 上記 `stripeWebhook` の URL
- **Events:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

作成後に表示される **Signing secret (`whsec_...`)** を `STRIPE_WEBHOOK_SECRET` に設定し、Functions を再デプロイ。

## 5. Firebase コンソール（未設定なら）

- **Authentication:** メール/パスワード + Google
- **Firestore:** データベース作成（`asia-northeast1` 推奨）

## 6. 料金（アプリ側の設定）

| プラン | 価格 |
|---|---|
| 単品（問題数 ≤100） | 無料 |
| 単品（101〜2999問） | ¥290〜¥980/月（問題数に応じて） |
| 単品（3000問以上） | ¥980/月 |
| プレミアムパック | ¥1980/月 |

プレミアムパック購入時、同一アカウントの単品サブスクは自動解約されます。
ロジック: **`config/pricing.js`（単一ソース）** → クライアントは `PricingConfig`、Functions は `_dev/sync-shared.py` で `functions/pricing-shared.js` に同期


## 7. 購読状態の保存先

`users/{uid}/private/entitlements`（クライアントは読み取りのみ、書き込みは Webhook）

## 8. 動作確認（テストモード）

1. https://buz-dojo.web.app を開く
2. ログイン
3. 科目カードの「購入」→ Stripe Checkout（テストカード `4242 4242 4242 4242`）
4. 成功後、数十秒で「購読中」表示
5. 「契約・お支払いの管理」→ Customer Portal

## 9. 本番公開前チェック

- [ ] Live モードの Stripe キーに差し替え
- [ ] Webhook を Live モード用に再登録
- [x] 特定商取引法・利用規約・プライバシー（`/legal/` とフッター）
- [ ] 特商法ページで氏名・住所・電話は「請求があれば開示」になっていること（必要ならお問い合わせで開示できる準備）
- [ ] 返金ポリシーは利用規約・特商法表記を確認
- [ ] Stripe のビジネス情報・銀行口座登録

## 10. 本番Webhookと買い切り移行 (2026-09-29 時点)

### 本番の Webhook エンドポイント (作成済み・未使用)

- 名前: buz-dojo-production
- URL: <https://asia-northeast1-buz-dojo.cloudfunctions.net/stripeWebhook>
- API バージョン: 2026-08-26.dahlia (作成画面で選択できなかったため既定値。dahlia で動く前提でコードを修正済み)
- 送信対象イベント: 作成画面で選んだ11件のまま (内訳は未確認。下の「必要な6件」との過不足を要確認)
- 署名シークレット (whsec): まだ Firebase に登録していない。登録すると
  サンドボックスの Webhook が全て署名検証に失敗するため、sk_live への切替と同時に入れ替える

### 本番切替の手順 (この順でないと途中で決済が壊れる)

1. Secret Manager の STRIPE_SECRET_KEY を sk_live に、STRIPE_WEBHOOK_SECRET を
   本番エンドポイントの whsec に、同時に入れ替える
2. Functions を再デプロイする (シークレットは再デプロイしないと反映されない)
3. 本番エンドポイントの「送信対象イベント」に必要な7件が入っていることを確認する
4. 少額の実決済を1回通して、付与と返金取り消しを確認する

### コードが分岐しているイベント (必要な7件)

このリストは functions/__tests__/webhook-events-doc.test.js が
functions/index.js の switch と突き合わせている。コードに case を足したら
ここにも1行足さないと CI が落ちる。1イベント1行で、名前は略さずに書くこと。

- checkout.session.completed — 購入時の付与 (サブスク・買い切りの両方)
- checkout.session.async_payment_succeeded — 遅延通知の支払い方法 (コンビニ・銀行振込) の入金確定
- customer.subscription.created — 月額の契約開始 (買い切り移行後は発火しない)
- customer.subscription.updated — 月額の契約更新・状態変化 (同上)
- customer.subscription.deleted — 月額の解約 (同上)
- charge.refunded — 全額返金で買い切りの付与を取り消す
- charge.dispute.closed — チャージバック確定 (status=lost) で付与を取り消す

上の7件以外は switch の default で無視される。余分に購読していても害は無いが、
不要な配信はリトライとログのノイズになるので、削れるなら削ってよい。
逆に1件でも欠けると、その経路は署名検証も通り、例外も出ず、ログにも残らないまま走らない。

### async_payment_succeeded を落とすと何が起きるか

コンビニ払い・銀行振込では、決済画面を終えた時点の checkout.session.completed が
payment_status=unpaid で届く。applyOneTimePurchase は unpaid を弾くので、ここでは付与しない。
実際の入金は後から checkout.session.async_payment_succeeded で通知され、そこで付与する。

このイベントを購読していないと、入金は済んでいるのに付与されない。
しかも署名検証は通り、例外も出ず、ログにも何も残らない。
コンビニ払い・銀行振込を Stripe 側で有効にしているなら、この1件は
charge.refunded と同じ重さで必須。無効にしているなら発火しないので余分な購読になる。

### サンドボックス側

charge.refunded と charge.dispute.closed は未追加。テスト購入の前に、
Webhook -> stripeWebhook -> 送信先を編集 から2件にチェックを入れて保存する。
「作成」ではなく「編集」なので署名シークレットは変わらない。

### 買い切り移行の合格条件

docs/SANDBOX_TEST_CHECKLIST.md を参照。サンドボックスでそのチェックリストを
全て通してから、上の本番切替に進む。
