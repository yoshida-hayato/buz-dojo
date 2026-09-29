# 並行レーン（buz-dojo = アプリ・課金）

問題マスタは **gakusyu-dojo（学習道場）** 専用。この repo では UI・課金・Functions・`subject.js` 鏡像のみ。

## 正本（2 repo 共通の手順）

リポジトリ外のワークスペースに同梱している場合:

`個人アプリ/docs/PARALLEL_LANES.md`

## buz だけの要点

1. 作業開始前: `git pull origin main`（自動エージェントが `main` に commit する）
2. Slack パッチは `subjects/**` の **`subject.js` 以外を拒否**（`scripts/bridge/apply_patch.py`）
3. 会長が gakusyu に問題を出したあと: `node _dev/sync-catalog.js` → commit / push → CI deploy

## 同期スクリプト（ローカル）

```bash
# 両 repo を GitHub 最新に
"/Users/yoshida/Documents/吉田隼人/個人アプリ/scripts/sync-from-github.sh"

# gakusyu 出荷後に catalog だけ合わせる
"/Users/yoshida/Documents/吉田隼人/個人アプリ/scripts/after-gakusyu-content.sh"
```
