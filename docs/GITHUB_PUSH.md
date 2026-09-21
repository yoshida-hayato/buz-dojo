# GitHub push で 403 が出るとき

## 症状

```
remote: Permission to yoshida-hayato/buz-dojo.git denied to yoshida0126.
fatal: unable to access '...': The requested URL returned error: 403
```

**別アカウント（yoshida0126）の認証情報が残っている**のが原因です。

## 手順

### 1. キーチェーンから古い認証を削除

1. **キーチェーンアクセス** を開く（Spotlight で「キーチェーンアクセス」）
2. 検索欄に `github` と入力
3. `github.com` や `git` に関する項目を **すべて削除**

### 2. ターミナルでも削除（任意）

```bash
printf "protocol=https\nhost=github.com\nusername=yoshida0126\n\n" | git credential-osxkeychain erase
printf "protocol=https\nhost=github.com\nusername=yoshida-hayato\n\n" | git credential-osxkeychain erase
```

### 3. Personal Access Token を作成（yoshida-hayato で）

1. https://github.com/settings/tokens に **yoshida-hayato** でログイン
2. **Generate new token (classic)**
3. スコープ（**両方必須**）:
   - **`repo`** … コードの push
   - **`workflow`** … `.github/workflows/` の push（Actions 定義ファイル用）
4. 表示されたトークン（`ghp_...`）をコピー（再表示不可）

> **よくあるエラー:** `without workflow scope` と出たら、トークンに `workflow` が付いていません。古いトークンを削除し、上記2つにチェックした新トークンで作り直してください。

### 4. push

```bash
cd "/Users/yoshida/Documents/吉田隼人/個人アプリ/ビジネス道場"
git push -u origin main
```

| 入力 | 値 |
|------|-----|
| Username | `yoshida-hayato` |
| Password | 上でコピーした **トークン**（GitHubのログインパスワードではない） |

---

リモート URL は `yoshida-hayato@github.com` 形式に設定済みです。
