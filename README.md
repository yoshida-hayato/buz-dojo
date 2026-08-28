# ビジネス道場

ビジネス向けの学習クイズアプリです。科目を切り替えて、同じUIで学べます。

公開 URL: https://buz-dojo.web.app

科目の直リンク（リロードしても科目ホームへ復帰）:

- https://buz-dojo.web.app/sap
- https://buz-dojo.web.app/windows-shortcuts
- https://buz-dojo.web.app/biz-career

（例: `/sap#stats` で成績画面を直接開く）

## 特徴

- **複数科目**: SAP・Windowsショートカット・ビジネスキャリアなど
- **問題マスタは別アプリ**: [docs/CONTENT_MASTER.md](docs/CONTENT_MASTER.md)
- **無料枠**: 有料科目は 1日20問まで無料（JST）。問題数100問以下の科目は全問無料
- **有料**: Stripe サブスク（単品 ¥290〜980/月・3000問以上は¥980、プレミアムパック ¥1980/月）
- **成績**: 科目別に localStorage / Firestore `users/{uid}/subjects/{subjectId}` へ保存

Stripe セットアップ: [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md)

X（毎日SAPクイズ）宣伝投稿: [docs/X_DAILY_QUIZ.md](docs/X_DAILY_QUIZ.md)

## 問題の追加（重要）

**このリポジトリには問題データを置きません。**

| 科目 | 編集する場所 |
|---|---|
| SAP | `SAPクイズ`（SAP道場） |
| 生管 / ショートカット | `学習道場` |

詳細: [docs/CONTENT_MASTER.md](docs/CONTENT_MASTER.md)

## 起動

```bash
cd "ビジネス道場"
python3 -m http.server 8020
# → http://localhost:8020
```

## 科目の追加

1. `subjects/_template/subject.js` をコピーして `subjects/<id>/subject.js` を作る（ブランド・段位のみ）
2. `subjects/registry.js` に `contentBase`（マスタ URL）付きでエントリを追加
3. 問題本体はマスタ側（学習道場 / SAP道場）に置く

## ディレクトリ構成（抜粋）

| パス | 内容 |
|---|---|
| `js/app.js` | 起動のみ（薄いブート）＋ `ensure*` 遅延読込 |
| `js/app-bridge.js` | auth ↔ ナビ等の疎結合 |
| `js/*` / `screens-*` / `quiz-*` | 画面・ドメイン別ロジック |
| `config/` | `version.js` / Firebase / 管理者 / **pricing.js（料金の単一ソース）** |
| `css/*.css` | 画面別スタイル（初回は base/header/subjects/mypage のみ） |
| `_dev/` | scripts/tools・CSS結合・pricing 同期（Hosting 非公開） |
| `docs/` | セットアップ手順（Hosting 非公開） |

### メンテ用コマンド

```bash
# CSS 分割ファイルを直したあと結合成果物を更新（任意・管理画面フォールバック用）
python3 _dev/rebuild-css.py

# 料金を変えたら Functions へ同期（deploy 時にも predeploy で実行）
python3 _dev/sync-shared.py
```

## Firebase

プロジェクト ID: `buz-dojo`（`.firebaserc`）

```bash
firebase deploy
```
