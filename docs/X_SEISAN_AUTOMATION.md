# 生産管理2級クイズ — 自動投稿カットオーバー（SAP分離）

著者: カモメ（マーケティング本部・本部長／成長）  
運用正本・実装窓口: カラス（プラットフォーム本部・本部長／リリース）  
参照: `X_ACCOUNT_SETUP_SEISAN.md`／`X_SEISAN_QUIZ.md`／`X_DAILY_QUIZ.md`（SAP正本・上書き禁止）

## 1行の結論

**SAP の `X_API_*` は触らない（非接触）。** 生産管理は `X_SEISAN_*` だけ。混在はブランド衝突＝即事故。**自動投稿は稼働済み。**  
Secrets／deploy／テスト投稿はカラスが運用する。ライオンは採否・振り分けのみ（手を動かさない）。

## いまの到達点（2026-09-14・稼働）

| 項目 | 状態 |
|---|---|
| X垢 | **稼働中** `@seisan_2_quiz`（案 `@seisan_2kyu_quiz` とは異なる実ハンドル） |
| プロフィール／誘導 | `https://buz-dojo.web.app/biz-career` |
| テスト投稿 | 成功 https://x.com/i/web/status/2099486323778416863 |
| Developer Portal ユースケース文面 | `X_ACCOUNT_SETUP_SEISAN.md` にコピペ済 |
| 実装ファイル | `functions/x-daily-seisan.js`（Secrets・Firestore・誘導・タグ分離済） |
| Scheduler | **毎朝 8:15 JST**（`xDailySeisanQuiz`／SAP 7:45 とずらす） |
| `functions/index.js` への export | **配線済**（`xDailySeisanQuiz`／`postXDailySeisanQuizNow` ほか） |
| Secrets 値 | **`X_SEISAN_*` 登録済**（再発行時のみ差し替え） |
| Functions デプロイ | **完了・稼働中** |

## 社長向け — 鍵をチャットに貼らない／再発行推奨

- **鍵4つをチャット・Issue・メールに貼らない。** 漏れた疑いがあれば Portal で再発行し、古い鍵を無効化。
- 差し替え後は `X_SEISAN_*` を対話で set → カラスに deploy 依頼（カモメ／ライオンは Secrets・deploy しない）。
- 詳細は `X_ACCOUNT_SETUP_SEISAN.md` 同名節。

## 絶対にやらないこと

- `firebase functions:secrets:set X_API_KEY` など **SAP用名（`X_API_*`／`X_ACCESS_*`）への上書き・参照・ログ漁り**（非接触）
- SAP垢（`@sap_dojo_quiz` 系）への投稿・テスト投稿
- オントロジー用X垢の作成
- 鍵をチャットに貼ること
- 社長が新鍵を渡していないのに secrets:set／deploy／実投稿すること（**現状稼働中＝触らない**）
- 日常確認で Cloud Scheduler「今すぐ実行」を常用すること（緊急用のみ・下記）

## Secret 対応表（生産管理専用）

ターミナルは `ビジネス道場` で実行。Portal で発行した **生産管理垢（`@seisan_2_quiz`）のアプリ** の値だけを貼る（再設定時）。  
**対象は必ず `X_SEISAN_*`。`X_API_*`／`X_ACCESS_*` はコマンドに出さない。**

```bash
cd "ビジネス道場"

firebase functions:secrets:set X_SEISAN_API_KEY --project buz-dojo
firebase functions:secrets:set X_SEISAN_API_SECRET --project buz-dojo
firebase functions:secrets:set X_SEISAN_ACCESS_TOKEN --project buz-dojo
firebase functions:secrets:set X_SEISAN_ACCESS_SECRET --project buz-dojo
```

| SEISAN Secret | Portal の表示 | SAP側（触るな・非接触） |
|---|---|---|
| `X_SEISAN_API_KEY` | コンシューマーキー | `X_API_KEY` |
| `X_SEISAN_API_SECRET` | コンシューマーシークレット | `X_API_SECRET` |
| `X_SEISAN_ACCESS_TOKEN` | アクセストークン（Read and Write） | `X_ACCESS_TOKEN` |
| `X_SEISAN_ACCESS_SECRET` | アクセストークンシークレット | `X_ACCESS_SECRET` |

Access Token は **Read and Write** で再発行したものを使う。

## 実装側の分離キー

| 項目 | 生産管理（SEISAN） | SAP（既存） |
|---|---|---|
| Secrets | `X_SEISAN_*` | `X_API_*` 系 |
| Firestore meta | `system/xDailySeisanQuiz` | `system/xDailySapQuiz` |
| 誘導URL | `https://buz-dojo.web.app/biz-career` | `/sap` |
| 問題マスタ | gakusyu `biz-career` | SAPマスタ |
| Scheduler | 8:15 JST | 7:45 JST |
| export | `xDailySeisanQuiz` 等 | `xDailySapQuiz` 等 |
| ハッシュタグ | 生産管理／検定系（最大4・SAPタグ禁止） | `#SAP` 等 |
| ハンドル | `@seisan_2_quiz` | `@sap_dojo_quiz` 系 |

---

## 運用手順（正本・カラス）

平時は触らない。**コード変更・障害調査・社長からの新鍵**のときだけ下を使う。  
稼働中のため、**社長が新鍵を渡したとき以外は secrets:set／deploy／実投稿をしない。**

### A. 手動テスト（正本）— `postXDailySeisanQuizNow`

admin ログイン済みのブラウザコンソール（または同等の Callable）。リージョンは `asia-northeast1`。

```js
const fn = firebase.app().functions("asia-northeast1")
  .httpsCallable("postXDailySeisanQuizNow");
await fn({ dryRun: true });   // 投稿せず中身確認（推奨・先）
await fn({ dryRun: false });  // 本番1回（生産管理垢のみ）
```

- テキストのみ: `fn({ dryRun: false, textOnly: true })`
- 親だけ成功して返信落ち: `fn({ retryLastReply: true })`
- 番号を #1 から: `fn({ resetSeq: true })`
- 成功後メタ: Firestore `system/xDailySeisanQuiz`

**これが手動確認の正本。** dryRun で足りるなら本番投稿しない。

### B. Scheduler 手動 run（緊急用のみ）

Cloud Scheduler の `xDailySeisanQuiz` を「今すぐ実行」するのは **Callable が使えない障害・緊急切り分け時だけ**。  
通常の動作確認・dryRun には使わない（本番投稿が走り、番号が進む）。

### C. ログ確認

```bash
cd "ビジネス道場"
firebase functions:log --only xDailySeisanQuiz,postXDailySeisanQuizNow --project buz-dojo
```

Console: Functions → 該当関数 → Logs。Firestore `system/xDailySeisanQuiz` の最終投稿時刻も併用。  
SAP 側（`xDailySapQuiz`／`X_API_*`）のログや Secrets は見ない・触らない。

### D. 再デプロイ（コード変更時）

```bash
cd "ビジネス道場/functions"
npm install
cd ..
firebase deploy --only functions:xDailySeisanQuiz,functions:postXDailySeisanQuizNow --project buz-dojo
```

**SAP 関数は含めない。** Hosting は本レーン不要。

### E. 鍵ローテ（社長が新鍵を渡したときだけ）

1. Portal（生産管理垢 `@seisan_2_quiz` のアプリ）で Read and Write の新鍵4つを控える（チャットに貼らない）
2. 上表どおり **`X_SEISAN_*` のみ** `secrets:set`（対話で貼付）
3. **D** の再デプロイ（Secret 参照を更新）
4. **A** で dryRun → 必要なら本番1回（生産管理垢だけ）
5. `X_API_*`／`X_ACCESS_*` は一度もコマンドに出さない

---

## 社長への渡し方（運用中）

1. 日次は Scheduler に任せる（8:15 JST）
2. 鍵漏洩疑い → Portal 再発行 → カラスへ「SEISAN 新鍵用意」→ `X_SEISAN_*` set → deploy → Callable 確認
3. 手投稿カレンダー（`X_SEISAN_QUIZ.md`）は障害時バックアップ
4. SAP 側 Secrets・垢には触れない（非接触）

## 止めるとき

- Scheduler で `xDailySeisanQuiz` だけ一時停止
- または該当 Functions の undeploy（SAP側は残す）

---

## 明朝 #1 観測チェックリスト（2026-09-15・実行しない）

著者: カモメ（マーケティング本部・本部長／成長）  
運用窓口: カラス（プラットフォーム本部・本部長／リリース）  
出典観点: ウシ（編集局・制作部・部長／生管デスク）  
根拠: 部長会議第10回。今夜は投稿・Secrets・deploy・Scheduler手動run をしない。

想定時刻: **2026-09-15 08:15 JST**（`xDailySeisanQuiz`）  
対象垢: `@seisan_2_quiz` のみ（SAP垢は見ない・触らない）

### 観測前（開くだけ・操作しない）

- [ ] X で `@seisan_2_quiz` のタイムラインを開く準備だけする
- [ ] Firebase Console で Functions／Scheduler の画面を開く準備だけする（「今すぐ実行」は押さない）
- [ ] Firestore `system/xDailySeisanQuiz` を見る準備だけする（書き換えない）

### 08:15 前後（目視）

- [ ] 親ポストが1本出ている（番号が **#1** または社長合意どおりの初回番号）
- [ ] 返信に正解・解説・誘導がある
- [ ] 誘導URLが `https://buz-dojo.web.app/biz-career`（SAP／他科目URL混入なし）
- [ ] ハッシュタグに `#SAP` 系が混ざっていない（生産管理／検定系のみ）
- [ ] SAP垢側に誤投稿がない（タイムラインをチラ見するだけ・操作しない）

### メタ／ログ（読むだけ）

- [ ] Firestore `system/xDailySeisanQuiz` の最終投稿時刻が朝の枠と一致
- [ ] 必要なら Functions ログを **閲覧のみ**（`xDailySeisanQuiz`／`postXDailySeisanQuizNow`）。`X_API_*` や SAP 関数は開かない

### 異常時のエスカレーション（実行はカラス）

- 欠番・二重投稿・誘導URL誤り・SAP混在 → カラス（プラットフォーム本部・本部長／リリース）へ。今夜の Callable／secrets:set はしない。
- 社長への報告は事実（出た／出てない／番号）だけ。鍵をチャットに貼らない。

### やらないこと（再掲）

- `postXDailySeisanQuizNow` の本番実行
- Scheduler「今すぐ実行」
- `X_SEISAN_*`／`X_API_*` の set・再デプロイ
- オントロジー垢・ショートカット垢の作成

---

## 2026-09-15 明朝 #1 観測結果（カモメ／カラス）

観測者: カラス（プラットフォーム本部・本部長／リリース）— Functions ログ閲覧のみ。Secrets／手動 run なし。

| 項目 | 結果 |
|---|---|
| 実行時刻 | 2026-09-15 08:15 JST 前後（ログ `2026-09-14T23:15:11Z`） |
| seq | **#1**（社長合意どおり） |
| 状態 | `ok: true`、親 `2099638097319428183`、返信 `2099638115904421952` |
| 問題 ID | `bc-t-pm-010`（プランニング系プール） |
| 誘導 URL | 実装正本どおり `https://buz-dojo.web.app/biz-career`（返信フッタ） |
| ハッシュタグ | `#SAP` 系なし（生産管理／ビジネスキャリア検定系のみ・コード正本） |
| SAP 垢 | 本観測では未操作（混在なし前提） |

親ポスト URL: https://x.com/i/web/status/2099638097319428183  
**判定: 明朝 #1 観測クローズ（異常なし）。** 明日以降は同チェックリストで #2 以降を継続。
