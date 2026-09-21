# Secrets レーン正本（SAP / SEISAN / Client）

著者: ヘビ（プラットフォーム本部・セキュリティ監査室）  
対象: ビジネス道場（`buz-dojo`）— Hosting クライアントと Cloud Functions

## 1行の結論

**X の実鍵は Functions Secrets のみ。** SAP は `X_API_*`、生産管理は `X_SEISAN_*` で名前も実装も分離。  
**クライアント（js / html / subjects）は X 系 Secret 名・値を一切載せない。** Firebase Web `apiKey` は `config/firebase-config.js` 1 ファイルだけ。

---

## 三レーン

| レーン | 置き場所 | Secret / 設定名 | 触ってよい人 |
|---|---|---|---|
| **SAP** | `functions/x-daily-sap.js` ほか | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | カラス（deploy 時）。SEISAN 作業者は**非接触** |
| **SEISAN** | `functions/x-daily-seisan.js` ほか | `X_SEISAN_API_KEY`, `X_SEISAN_API_SECRET`, `X_SEISAN_ACCESS_TOKEN`, `X_SEISAN_ACCESS_SECRET` | カラス（deploy 時）。SAP レーンは**非接触** |
| **Client** | Hosting 配下（`js/`, `config/`, `subjects/`, `*.html`） | **Secret 禁止**。Firebase 公開設定のみ | 全開発者（値のコピペ禁止） |

その他サーバー専用（クライアント禁止）: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`（`functions/index.js`）。

---

## SAP vs SEISAN — 混在禁止

- **Secret 名を跨いで set しない**（例: SEISAN 作業中に `X_API_KEY` をコマンドに出さない）。
- **関数・Scheduler・Firestore meta を混ぜない**（SAP: `xDailySapQuiz` / SEISAN: `xDailySeisanQuiz`）。
- **垢・誘導 URL・ハッシュタグを混ぜない**（詳細は `X_SEISAN_AUTOMATION.md`, `X_DAILY_QUIZ.md`）。
- 監査・ログは**自分のレーンだけ**閲覧。他レーンの Secrets 値・ログ漁りは事故要因。

---

## Client — no-secrets ルール

### 禁止（Hosting に載せてはいけないもの）

- `X_API_*`, `X_ACCESS_*`, `X_SEISAN_*` の**文字列**（defineSecret 名のコピペ、値、`.env` 由来の貼り付け）
- Stripe 秘密鍵、X OAuth トークン、サービスアカウント JSON
- 問題マスタ以外の「本番だけの鍵」を js に直書き

### 許可（公開前提）

- `config/firebase-config.js` の Firebase Web 設定（`apiKey` 含む）。Google 公式どおり **Hosting 公開前提**の識別子。
- クライアントコードからは `FIREBASE_CONFIG.apiKey` 等の**参照のみ**（リテラル `apiKey: "AIza..."` を他ファイルに増やさない）。

### 境界

- `functions/` はサーバー。ここに Secret 名があってよいが、**ビルド成果物や Hosting へバンドルしない**。
- `_dev/` は開発用。本番 Hosting にコピーしない。

---

## 静的監査（触らない・鍵を読まない）

```bash
cd "ビジネス道場"
bash _dev/tools/scan-client-secrets.sh
```

| 検査 | 意味 |
|---|---|
| `X_API_KEY` 等 | X SAP Secret 名がクライアントに漏れていないか |
| `X_SEISAN_*` | 生産管理 Secret 名がクライアントに漏れていないか |
| `apiKey: "AIza..."` | Firebase キーの**直書きが正本以外**にないか |

- **exit 0**: クライアント束ねにおける当該パターンなし  
- **exit 1**: ヒットあり — 修正してから Hosting / マージ

デプロイ前の品質ゲートの一つ。Secrets の get / set / 値の表示はこのスクリプトの範囲外（ヘビは本番 Secret を操作しない）。

---

## 漏洩疑い時

1. チャット・Issue・コミットに鍵を貼らない。  
2. Portal / Stripe で**再発行** → カラスが該当レーンの Secrets のみ set → deploy。  
3. 横断レーンは触らない（SAP 疑いで SEISAN をローテしない、など）。

---

## 参照

- `docs/X_SEISAN_AUTOMATION.md` — SEISAN 運用・SAP 非接触  
- `functions/x-daily-sap.js` / `functions/x-daily-seisan.js` — 実装正本  
- `config/firebase-config.js` — クライアント Firebase 設定の唯一のリテラル置き場

---

## 週次 scan ログ（ヘビ）

- 2026-09-15: `_dev/tools/scan-client-secrets.sh` **exit 0** — OK: client secret scan clean (X_* names and stray apiKey literals).
