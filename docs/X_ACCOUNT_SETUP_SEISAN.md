# 生産管理2級クイズ — Xアカウント手作業セットアップ

カモメ（マーケティング本部・本部長／成長）。**AIはXにログインして垢を作れない。** 社長が手元で作成する。詳細運用は `X_SEISAN_QUIZ.md`。

**稼働済み（2026-09-14）。** 垢 `@seisan_2_quiz`（案の `@seisan_2kyu_quiz` とは異なる実ハンドル）。自動投稿は Scheduler `xDailySeisanQuiz`（毎朝 8:15 JST）で稼働。Secrets は `X_SEISAN_*` のみ（`X_API_*` 上書き禁止）。手順の正本は `X_SEISAN_AUTOMATION.md`／`X_SEISAN_QUIZ.md`。

## 社長向け — 鍵をチャットに貼らない／再発行推奨

- **API Key・Secret・Access Token をチャット・Issue・Slack・メールに貼らない。** 漏れたら Portal で即再発行し、古い鍵は無効化する。
- チャットや共有ログに一度でも貼った疑いがある場合は **再発行推奨**（本番は `X_SEISAN_*` を新しい値で差し替え → カラスに deploy 依頼。カモメ／ライオンは Secrets・deploy しない）。
- 値の受け渡しは対話プロンプト（`firebase functions:secrets:set` の入力）か、社長手元のパスワードマネージャのみ。

## 社長がやった手作業（記録）

1. **Xで新規アカウント作成**（既存SAP垢・別サービス垢とは別）
2. **表示名・ユーザー名・プロフィール**を設定し、誘導先 `https://buz-dojo.web.app/biz-career` を確認
3. テスト投稿成功: https://x.com/i/web/status/2099486323778416863

以降の手投稿カレンダーは `X_SEISAN_QUIZ.md`。自動化の運用正本は `X_SEISAN_AUTOMATION.md`。

## 実アカウント（稼働中）

| 項目 | 値 |
|---|---|
| 表示名 | 生産管理2級クイズ |
| ユーザー名 | `@seisan_2_quiz`（実ハンドル。案 `@seisan_2kyu_quiz` は未使用） |
| 代替表示名 | 生産管理検定クイズ |
| Scheduler | 毎朝 8:15 JST（`xDailySeisanQuiz`）／SAP は 7:45 |
| Secrets | `X_SEISAN_*`（SAP `X_API_*` と分離） |
| 誘導 | https://buz-dojo.web.app/biz-career |

### プロフィール全文（コピペ・参照用）

```
ビジネスキャリア検定・生産管理プランニング2級／オペレーション2級の対策クイズ（非公式）
毎日1問｜答えは返信｜合格保証なし
本編は無料枠あり → https://buz-dojo.web.app/biz-career
```

## 作成後チェック（短）

- [x] 表示名が「生産管理2級クイズ」（または代替）
- [x] プロフィールにプランニング2級／オペレーション2級・非公式・合格保証なし・biz-career URL
- [x] 実ハンドル `@seisan_2_quiz`／テスト投稿成功
- [x] SAP道場クイズ垢には何も投稿していない
- [x] オントロジー用の垢は作っていない
- [x] `X_SEISAN_*` Secrets 登録済・自動投稿稼働（再発行時のみ Portal 再取得）

## 禁止

- SAP垢への混在投稿
- オントロジー垢の作成
- SAP 用 Secrets（`X_API_KEY` 等）の上書き
- 鍵をチャットに貼ること

## 自動化（稼働済み・参照）

コード・関数名・Scheduler は稼働中。鍵の再設定が必要なときだけ次を実行（値は対話で貼付。チャット禁止）。

```bash
cd "ビジネス道場"
firebase functions:secrets:set X_SEISAN_API_KEY --project buz-dojo
firebase functions:secrets:set X_SEISAN_API_SECRET --project buz-dojo
firebase functions:secrets:set X_SEISAN_ACCESS_TOKEN --project buz-dojo
firebase functions:secrets:set X_SEISAN_ACCESS_SECRET --project buz-dojo

firebase deploy --only functions:xDailySeisanQuiz,functions:postXDailySeisanQuizNow --project buz-dojo
```

詳細・dryRun は `X_SEISAN_QUIZ.md` の「自動投稿」節。deploy はカラス（プラットフォーム本部・本部長／リリース）窓口。

## Developer Portal — ユースケース説明（コピペ用）

PPUパイロット契約／開発者ポリシーの「XのデータおよびAPIのすべてのユースケースを説明してください」欄用。英語欄がある場合は下の English を使う。

### 日本語（推奨・そのまま貼付可）

```
本アプリ（Xアカウント「生産管理2級クイズ」／@seisan_2_quiz）は、自社学習サービス「ビジネス道場」の宣伝・教育目的で、X APIを次の用途にのみ使用します。

【投稿】
・自アカウントから、生産管理（ビジネスキャリア検定・プランニング2級／オペレーション2級）のクイズを定期投稿する
・親投稿：自前で生成した問題画像と短い問いかけ（第三者の投稿は含めない）
・返信投稿：正解・解説・サービス誘導URL（https://buz-dojo.web.app/biz-career）

【読み取り】
・自アカウントの投稿成否確認など、運用に必要な最小限の読み取りのみ
・他ユーザーのタイムライン収集、スクレイピング、センチメント分析、広告ターゲティング用のプロファイリングは行わない

【データの扱い】
・Xから取得したデータを販売・再配布・第三者への提供はしない
・ユーザー生成コンテンツの大規模保存・学習データ化はしない
・問題文・解説・画像は自社が作成したコンテンツである

【規模】
・投稿は原則1日あたり親1＋返信1程度（メディアアップロードを含む）
・自動化は Firebase 上の自社バックエンドから、承認済みアプリの認証情報で行う

以上がすべてのユースケースです。
```

### English（Portalが英語必須のとき）

```
We use the X API solely for educational and promotional posts from our own account ("Production Management Grade-2 Quiz" / @seisan_2_quiz), which promotes our learning service "Business Dojo" (https://buz-dojo.web.app/biz-career).

Posting:
- Schedule quiz posts about production management exam prep (Business Career Certificate: Planning Grade-2 / Operations Grade-2), non-official study aid.
- Parent post: our own quiz image and a short prompt (no third-party posts embedded).
- Reply post: correct answer, short explanation, and a link to our free-tier learning page.

Read access:
- Only the minimum needed to confirm our own posts succeeded.
- We do not scrape other users’ timelines, build social graphs, do sentiment analysis, or profile users for ads.

Data handling:
- We do not sell, redistribute, or share X data with third parties.
- We do not store or train on other users’ content at scale.
- Quiz text/images are our own content.

Volume:
- Typically about one parent post and one reply per day (including media upload).
- Automation runs from our own Firebase backend using approved app credentials.

These are all of our use cases.
```
