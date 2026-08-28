# X（Twitter）毎日 SAP クイズ投稿

ビジネス道場への誘導用。アカウント案Aで運用します。

## アカウント設定（手作業）

| 項目 | 値 |
|---|---|
| 表示名 | SAP道場クイズ |
| ユーザー名 | `@sap_dojo_quiz`（空きがなければ近い名前） |
| プロフィール | 毎日1問・SAP実務クイズ（非公式）｜答えは返信｜本編は無料枠あり → https://buz-dojo.web.app/sap |
| 投稿 | 毎朝 **7:45（JST）** に自動1本 |

## 投稿の形

1. **親ポスト**: 問題画像 ＋ 短い問いかけ（URLなし）＋ 厳選ハッシュタグ
2. **返信**: `正解：A` ＋ 可能な限りの解説 ＋ 必須フッタ（サイト誘導）

### ハッシュタグ方針（親のみ・最大4）

| 種別 | 例 | 目的 |
|---|---|---|
| 必須 | `#SAP` `#SAPクイズ` | 認知・ブランド |
| モジュール | `#FI` `#MM` など | 関心層への発見 |
| 広め | `#ERP` | 隣接検索からの流入 |

親ポスト（画像）の問いかけは **「正解はどれ？」**（選択肢が3つでも A〜D とは書かない）。

多すぎるとスパムっぽく見え、リーチが落ちやすいので **最大4つ** に抑えます。返信側にはハッシュタグを付けません（誘導文とURLを優先）。

1日あたり API 呼び出しはおおむね「投稿2回＋メディア1回」です。

## X Developer Portal 手順

1. https://developer.x.com/ でプロジェクト／アプリを作成
2. **User authentication** を有効化（Read and write）
3. 次を発行して控える
   - API Key
   - API Key Secret
   - Access Token
   - Access Token Secret  
   （Access Token は **Read and Write** 権限で再発行すること）
4. 料金プランは Portal の表示を確認する  
   - かつての「月1500投稿無料」は廃止・変更されている場合があります  
   - 2026年時点では **従量課金（pay-per-use）** の案内が出ることが多いです  
   - URL付き投稿は単価が高いことがあるため、親ポストにはURLを入れず返信／プロフィールに寄せています

## Firebase Secrets 登録

ターミナルで1つずつ実行し、表示されたら Portal で控えた値を貼り付けて Enter。

```bash
cd "ビジネス道場"

# 1) API Key ＝ コンシューマーキー
firebase functions:secrets:set X_API_KEY --project buz-dojo

# 2) API Key Secret ＝ コンシューマーシークレット
firebase functions:secrets:set X_API_SECRET --project buz-dojo

# 3) Access Token ＝ アクセストークン
firebase functions:secrets:set X_ACCESS_TOKEN --project buz-dojo

# 4) Access Token Secret ＝ アクセストークンシークレット
firebase functions:secrets:set X_ACCESS_SECRET --project buz-dojo
```

対応表:

| Secret 名 | Portal の表示 |
|---|---|
| `X_API_KEY` | コンシューマーキー |
| `X_API_SECRET` | コンシューマーシークレット |
| `X_ACCESS_TOKEN` | アクセストークン |
| `X_ACCESS_SECRET` | アクセストークンシークレット |

## デプロイ

```bash
cd "ビジネス道場/functions"
npm install
cd ..
firebase deploy --only functions:xDailySapQuiz,functions:postXDailySapQuizNow --project buz-dojo
```

初回は Cloud Scheduler のジョブも作成されます（`xDailySapQuiz`）。

## 動作確認（おすすめ順）

管理画面にログインした状態のブラウザコンソール、または一時スクリプトで Callable を呼びます。

### 1) dryRun（投稿せず中身だけ確認）

```js
const fn = firebase.app().functions("asia-northeast1")
  .httpsCallable("postXDailySapQuizNow");
const res = await fn({ dryRun: true });
console.log(res.data);
```

### 2) 本番投稿（1回だけ・画像付きがデフォルト）

```js
const res = await fn({ dryRun: false });
console.log(res.data); // tweet URL など
```

テキストのみ切り分け: `fn({ dryRun: false, textOnly: true })`

親だけ成功して返信が落ちた場合:

```js
const res = await fn({ retryLastReply: true });
console.log(res.data);
```

番号を #1 からやり直す場合:

```js
const res = await fn({ resetSeq: true });
console.log(res.data);
```

曜日ローテの4カテゴリ（tcode / term / judgment / scenario）を連続投稿:

```js
const res = await fn({ allCategories: true });
console.log(res.data);
```

特定カテゴリだけ:

```js
const res = await fn({ preferCategory: "judgment" });
console.log(res.data);
```

成功すると Firestore `system/xDailySapQuiz` に最終投稿が記録されます。

## 実装ファイル

- `functions/x-daily-sap.js` … 問題取得・画像生成・投稿
- `functions/index.js` … `xDailySapQuiz` / `postXDailySapQuizNow` を export

## 注意

- SAP 社の公式アカウントではありません。プロフィールに「非公式」を明記してください
- 問題は AI／学習支援目的であり合格保証はありません（本編の利用規約と同趣旨）
- 自動投稿を止めるときは Scheduler で `xDailySapQuiz` を一時停止、または Functions を undeploy
