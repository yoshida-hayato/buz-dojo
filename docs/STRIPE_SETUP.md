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
