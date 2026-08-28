# Firebase Authentication 有効化（buz-dojo）

新規登録・ログインが `CONFIGURATION_NOT_FOUND` になる場合、**Authentication が未設定**です。

## 手順（5分）

1. コンソールを開く  
   https://console.firebase.google.com/project/buz-dojo/authentication

2. **「始める」**（Get started）をクリック

3. **Sign-in method** タブで以下を有効化
   - **メール / パスワード** → 有効にする
   - **Google**（任意）→ 有効にする

4. **Settings** タブ → **Authorized domains** に以下があるか確認
   - `buz-dojo.web.app`
   - `localhost`（ローカル開発用）

5. サイトで再度「新規登録」を試す

## 確認

ブラウザの開発者ツールでエラーが消え、登録後に「ログイン中のアカウント: …」と表示されれば OK です。

## 補足

- Firestore も未作成の場合は別途 **Firestore Database** を作成してください（成績のクラウド保存用）
- Stripe 決済（Cloud Functions）には **Blaze プラン** が必要です（Authentication 自体は無料プランで可）
