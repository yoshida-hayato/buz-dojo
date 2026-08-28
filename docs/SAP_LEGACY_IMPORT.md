# 過去アプリ → ビジネス道場 成績取り込み

SAP道場（`sap-dojo`）と学習道場（`gakusyu-dojo`）で貯めた成績を、ビジネス道場の対応科目へ引き継ぎます。

## 対応表

| 元アプリ | 元の場所 | ビジネス道場の科目 |
|---|---|---|
| SAP道場 | `users/{uid}`（単一） | SAP |
| 学習道場 | `users/{uid}/subjects/biz-career` | ビジネスキャリア |
| 学習道場 | `users/{uid}/subjects/windows-shortcuts` | Windowsショートカット |

学習道場の「会社人物」はビジネス道場に無いため取り込み対象外です。

## ユーザー側の操作

1. https://buz-dojo.web.app を開く
2. 過去アプリと **同じメールアドレス** でログイン
3. 該当科目を開く（ログイン直後に自動取り込み）
4. **成績・段位**で確認

科目ごとに **1回だけ** 取り込みます（`sapLegacyImportedAt` / `gakusyuLegacyImportedAt`）。

## 管理者セットアップ（初回のみ）

プリンシパル（両方共通）:

```
firebase-adminsdk-fbsvc@buz-dojo.iam.gserviceaccount.com
```

### 1. SAP道場（sap-dojo）

[IAM](https://console.cloud.google.com/iam-admin/iam?project=sap-dojo) で上記プリンシパルに:

- **Cloud Datastore ユーザー**
- **Firebase Authentication Admin**（推奨）

### 2. 学習道場（gakusyu-dojo）— 同じ手順

[IAM](https://console.cloud.google.com/iam-admin/iam?project=gakusyu-dojo) で同じプリンシパルに:

- **Cloud Datastore ユーザー**
- **Firebase Authentication Admin**（推奨）

## ローカル（同一ブラウザ）

ログインなしでも、同じブラウザに残っている localStorage をマージします。

| 元キー | 先キー |
|---|---|
| `sap_tcode_dojo_stats_v1` | `biz_dojo_sap_stats_v1` |
| `study_dojo_biz_career_stats_v1` | `biz_dojo_biz_career_stats_v1` |
| `study_dojo_windows_shortcuts_stats_v1` | `biz_dojo_windows_shortcuts_stats_v1` |

## みんなの正答率（questionStats）の合算

ログイン後、Cloud Function `mergeLegacyQuestionStats` が **1回だけ** 自動実行され、次をビジネス道場へ加算します。

- `sap-dojo` の `questionStats`
- `gakusyu-dojo` の `questionStats`

同じ問題 ID は件数が加算されます。ソースごとに `system/questionStatsLegacyMerge.sources.{source}` に完了フラグが付き、二重計上しません。

※ 過去に完了フラグを `sources.sap-dojo` というドット付きフィールド名で書いていたバグがあり、サーバ側の「済」判定が効かず再合算されて約4倍になっていました。`repairQuestionStatsQuadruple` で ÷4 修復済みです。

IAM（Datastore ユーザー）は個人成績取り込みと同じ設定で足ります。

## 確認

Network で次を確認:

| 関数 | 結果の見方 |
|---|---|
| `importLegacyDojoStats` | 個人成績。`imported: true` で成功 |
| `mergeLegacyQuestionStats` | みんなの正答率。`results[].written` が合算件数 |

| reason | 意味 |
|---|---|
| `already_imported` / `already_merged` | 取り込み済み |
| `*_access_denied` | 該当プロジェクトの IAM 未設定 |

## 位置づけ

使い捨て移行ではなく、**問題マスタ側（SAP道場 / 学習道場）で貯めた成績・正答率をビジネス道場（本番）へ持ち込むための橋渡し**です。同じメールでログインすれば引き継げます。

## 関連ファイル

- `js/legacy-stats-import.js` — 個人成績クライアント（`js/sap-legacy-import.js` は互換シム）
- `js/question-stats-legacy.js` — みんなの正答率クライアント
- `functions/legacy-import.js` — 個人成績 Function
- `functions/question-stats-merge.js` — 正答率合算 Function
- `functions/stats-merge.js` — マージロジック
