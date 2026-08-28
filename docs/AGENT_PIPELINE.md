# クイズ自動開発 ＆ マーケティングコンテンツ生成パイプライン

ビジネス道場本体（`index.html` / `js/` / `subjects/`）とは**独立**した実験用パイプラインです。
生成物は `src/data/quizzes/` と `marketing/` に保存され、Firebase Hosting にはデプロイされません。

## バックアップ

構築前のスナップショット:

- `_backups/ビジネス道場-pre-agent-pipeline-YYYYMMDD-HHMMSS.tar.gz`（リポジトリ親ディレクトリ）

## ローカル実行

```bash
cd ビジネス道場
export GEMINI_API_KEY="your-key"
python3 -m venv .venv-agent
source .venv-agent/bin/activate
pip install -r scripts/requirements.txt
python scripts/agents/pipeline.py
```

## GitHub Actions

1. リポジトリの Secrets に `GEMINI_API_KEY` を登録
2. Actions タブから `Daily Quiz Generator` を手動実行、または cron（UTC 23:00 ≒ JST 08:00）で自動実行
3. 変更がある場合のみ PR が自動作成されます

## エージェント構成

| エージェント | 役割 |
|---|---|
| Idea | クイズ原案作成 |
| Logic Review | 論理・事実の批判レビュー |
| UX Review | 難易度・解説の教育品質レビュー |
| JSON Engineer | スキーマ準拠 JSON 化 |
| Marketing | note 記事・Shorts 台本 |
