#!/usr/bin/env python3
"""
リポジトリ自動改善エージェント。

既存の scripts/agents/pipeline.py（クイズ生成）と同じ流儀で、Gemini を使って
リポジトリ自身の改善を継続的に行う。

モード（環境変数 IMPROVE_MODE）:
  propose (既定) — スキャンして改善候補を出し、レポートするだけ。書き換えない。
  apply          — 候補のうち1件を実装し、テストが通った場合のみコミットする。

安全装置（apply モード）:
  - 1回の実行で変更するのは1ファイルのみ
  - 変更行数の上限（MAX_CHANGED_LINES）
  - テストが通らなければ変更を破棄（コミットしない）
  - 変更対象にテストが存在するかをレポートに明記する

出力:
  - 標準出力（GitHub Actions のログ）
  - report.md（ワークフローが Job Summary / Slack / Issue に流す）
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = REPO_ROOT / "improve-report.md"

DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MODE = os.environ.get("IMPROVE_MODE", "propose").strip().lower()
MAX_CHANGED_LINES = int(os.environ.get("MAX_CHANGED_LINES", "80"))
MAX_FILE_CHARS = 60000

JST = timezone(timedelta(hours=9))

# スキャン対象から除外するパス
EXCLUDE_DIRS = {
    ".git", "node_modules", ".firebase", ".venv-agent", "assets",
    "_backups", ".cursor", "__pycache__",
}
# 自動改善の対象にできる拡張子（バイナリ・巨大データを避けるため）
EDITABLE_SUFFIXES = {".js", ".css", ".html", ".md", ".py", ".json", ".rules", ".yml", ".yaml"}


def log(msg: str) -> None:
    print(f"[improve] {msg}", flush=True)


def run(cmd: List[str], cwd: Path = REPO_ROOT) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


# --------------------------------------------------------------------------
# リポジトリの状態収集
# --------------------------------------------------------------------------

def list_files() -> List[Path]:
    files: List[Path] = []
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        if path.suffix not in EDITABLE_SUFFIXES:
            continue
        files.append(path)
    return sorted(files)


def tested_paths() -> List[str]:
    """テストが存在する対象のざっくりした一覧（レポート用）。"""
    covered = []
    if (REPO_ROOT / "functions" / "__tests__" / "pricing-shared.test.js").exists():
        covered.append("functions/pricing-shared.js")
    if (REPO_ROOT / "functions" / "__tests__" / "entitlements.test.js").exists():
        covered.append("functions/entitlements.js")
    if (REPO_ROOT / "firestore-tests" / "rules.test.js").exists():
        covered.append("firestore.rules")
    return covered


def collect_todos(limit: int = 40) -> List[str]:
    result = run(["git", "grep", "-n", "-E", r"TODO|FIXME|XXX|HACK"])
    if result.returncode != 0:
        return []
    lines = [ln for ln in result.stdout.splitlines() if not ln.startswith("node_modules")]
    return lines[:limit]


def recent_commits(n: int = 10) -> str:
    result = run(["git", "log", f"-{n}", "--oneline"])
    return result.stdout.strip()


def build_context() -> str:
    files = list_files()
    file_lines = []
    for f in files:
        rel = f.relative_to(REPO_ROOT)
        try:
            size = f.stat().st_size
        except OSError:
            continue
        file_lines.append(f"{rel} ({size}B)")

    todos = collect_todos()
    readme = ""
    readme_path = REPO_ROOT / "README.md"
    if readme_path.exists():
        readme = readme_path.read_text(encoding="utf-8")[:4000]

    return "\n".join(
        [
            "## 直近のコミット",
            recent_commits(),
            "",
            "## README（冒頭）",
            readme,
            "",
            "## ファイル一覧",
            "\n".join(file_lines),
            "",
            "## TODO/FIXME コメント",
            "\n".join(todos) if todos else "(なし)",
            "",
            "## 自動テストが存在する対象",
            "\n".join(tested_paths()) or "(なし)",
        ]
    )


# --------------------------------------------------------------------------
# Gemini
# --------------------------------------------------------------------------

class Candidate(BaseModel):
    title: str = Field(min_length=5, max_length=120)
    rationale: str = Field(min_length=20)
    target_file: str = Field(min_length=3)
    kind: str = Field(description="bugfix | refactor | docs | ux | test | cleanup")
    risk: str = Field(description="low | medium | high")
    mechanical: bool = Field(
        description="ファイル単体の書き換えだけで完結し、判断の余地が小さいなら true"
    )


class CandidateList(BaseModel):
    candidates: List[Candidate] = Field(min_length=1, max_length=5)


class Rewrite(BaseModel):
    explanation: str = Field(min_length=20)
    new_content: str = Field(min_length=1)


def get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY が未設定です（GitHub Secrets を確認してください）")
    return genai.Client(api_key=api_key)


def call_gemini(client: genai.Client, *, system: str, user: str, schema: type[BaseModel]):
    response = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.4,
            response_mime_type="application/json",
            response_schema=schema,
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Gemini API が空の応答を返しました")
    return schema.model_validate_json(text)


SCAN_SYSTEM = """あなたは「ビジネス道場」という学習クイズアプリ（Firebase Hosting + Cloud Functions +
Firestore + Stripe課金）のコードベースを継続的に改善する担当エンジニアです。

リポジトリの情報を渡すので、いま着手する価値が高い改善候補を最大5件、優先度順に挙げてください。

重視すること:
- ユーザーに実害が出うる不具合、エラーハンドリング漏れ
- ドキュメントとコードの食い違い
- 重複・デッドコード
- テストが無い重要ロジックへのテスト追加
- UIの文言や表記ゆれ

避けること:
- 大規模なリファクタや設計変更（1ファイルで完結しないもの）
- 動作を確認できない推測ベースの変更
- 問題データ（src/data）やマーケティング文面の内容変更（別パイプラインの担当）

mechanical は、そのファイルを読めば機械的に直せる（判断の余地が小さい）場合のみ true にしてください。"""

APPLY_SYSTEM = """あなたは慎重なエンジニアです。指定されたファイルの改善を1件だけ実施し、
ファイル全体の新しい内容を返してください。

厳守:
- 指示された改善のみを行う。ついでの整形や無関係な変更をしない
- 既存のコードスタイル・インデント・言語（日本語コメント等）を維持する
- 機能を壊さない。確信が持てない場合は、元の内容をそのまま返す
- new_content にはファイル全体を入れる（差分ではない）"""


# --------------------------------------------------------------------------
# apply モード
# --------------------------------------------------------------------------

def run_tests() -> tuple[bool, str]:
    """functions のユニットテストと Firestore ルールテストを実行。"""
    outputs = []

    log("テスト実行: functions unit tests")
    unit = run(["npm", "test"], cwd=REPO_ROOT / "functions")
    outputs.append(f"[functions npm test] exit={unit.returncode}\n{unit.stdout[-3000:]}{unit.stderr[-2000:]}")
    if unit.returncode != 0:
        return False, "\n\n".join(outputs)

    log("テスト実行: firestore rules tests")
    rules = run(["npm", "run", "test:rules"])
    outputs.append(f"[npm run test:rules] exit={rules.returncode}\n{rules.stdout[-3000:]}{rules.stderr[-2000:]}")
    if rules.returncode != 0:
        return False, "\n\n".join(outputs)

    return True, "\n\n".join(outputs)


def changed_line_count() -> int:
    result = run(["git", "diff", "--numstat"])
    total = 0
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            for p in parts[:2]:
                if p.isdigit():
                    total += int(p)
    return total


def apply_candidate(client: genai.Client, cand: Candidate) -> dict:
    """1件実装してテストする。結果を dict で返す。"""
    target = (REPO_ROOT / cand.target_file).resolve()
    result = {"applied": False, "committed": False, "reason": "", "tests": ""}

    # パス検証（リポジトリ外・対象外拡張子を弾く）
    try:
        target.relative_to(REPO_ROOT)
    except ValueError:
        result["reason"] = f"リポジトリ外のパスが指定されました: {cand.target_file}"
        return result
    if not target.exists() or not target.is_file():
        result["reason"] = f"ファイルが存在しません: {cand.target_file}"
        return result
    if target.suffix not in EDITABLE_SUFFIXES:
        result["reason"] = f"対象外の拡張子です: {target.suffix}"
        return result

    original = target.read_text(encoding="utf-8")
    if len(original) > MAX_FILE_CHARS:
        result["reason"] = f"ファイルが大きすぎます（{len(original)}文字）。手動対応が必要です。"
        return result

    log(f"実装中: {cand.target_file} — {cand.title}")
    rewrite = call_gemini(
        client,
        system=APPLY_SYSTEM,
        user=(
            f"# 改善内容\n{cand.title}\n\n## 理由\n{cand.rationale}\n\n"
            f"# 対象ファイル: {cand.target_file}\n```\n{original}\n```"
        ),
        schema=Rewrite,
    )

    if rewrite.new_content.strip() == original.strip():
        result["reason"] = "変更なし（モデルが現状維持を選択）"
        return result

    target.write_text(rewrite.new_content, encoding="utf-8")
    result["applied"] = True
    result["explanation"] = rewrite.explanation

    lines = changed_line_count()
    if lines > MAX_CHANGED_LINES:
        run(["git", "checkout", "--", cand.target_file])
        result["applied"] = False
        result["reason"] = f"変更が大きすぎます（{lines}行 > 上限{MAX_CHANGED_LINES}行）。破棄しました。"
        return result

    passed, test_output = run_tests()
    result["tests"] = test_output[-4000:]
    if not passed:
        run(["git", "checkout", "--", cand.target_file])
        result["reason"] = "テストが失敗したため変更を破棄しました。"
        return result

    run(["git", "add", cand.target_file])
    msg = (
        f"auto: {cand.title}\n\n{cand.rationale}\n\n"
        f"変更ファイル: {cand.target_file}（{lines}行）\n"
        f"テスト: functions unit + firestore rules すべて成功\n\n"
        f"Generated by scripts/improve/agent.py"
    )
    commit = run(["git", "commit", "-m", msg])
    if commit.returncode != 0:
        result["reason"] = f"コミットに失敗しました: {commit.stderr[:500]}"
        return result

    result["committed"] = True
    result["changed_lines"] = lines
    return result


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> int:
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    log(f"開始 mode={MODE} model={DEFAULT_MODEL}")

    client = get_client()
    context = build_context()

    scanned = call_gemini(
        client,
        system=SCAN_SYSTEM,
        user=f"# リポジトリの状態\n{context}",
        schema=CandidateList,
    )
    log(f"改善候補 {len(scanned.candidates)} 件")

    covered = tested_paths()
    lines = [f"# 自動改善レポート（{now}）", "", f"モード: `{MODE}`", "", "## 改善候補", ""]
    for i, c in enumerate(scanned.candidates, 1):
        mark = "✅テストあり" if c.target_file in covered else "⚠️テストなし"
        lines.append(
            f"{i}. **{c.title}**  \n"
            f"   `{c.target_file}` / {c.kind} / risk:{c.risk} / {mark}  \n"
            f"   {c.rationale}"
        )
    lines.append("")

    exit_code = 0
    if MODE == "apply":
        target = next((c for c in scanned.candidates if c.mechanical), None)
        if target is None:
            lines.append("## 実装結果\n\n機械的に実施できる候補が無かったため、今回は提案のみです。")
        else:
            outcome = apply_candidate(client, target)
            lines.append("## 実装結果\n")
            lines.append(f"対象: **{target.title}** (`{target.target_file}`)\n")
            if outcome.get("committed"):
                covered_note = (
                    "この変更はテストで保護された範囲です。"
                    if target.target_file in covered
                    else "⚠️ この変更にはこのファイルを直接検証するテストがありません（テストは全体の回帰のみ確認）。"
                )
                lines.append(
                    f"✅ コミット済み（{outcome.get('changed_lines')}行変更、テスト全通過）\n\n"
                    f"{outcome.get('explanation', '')}\n\n{covered_note}"
                )
            else:
                lines.append(f"⏭ コミットなし: {outcome.get('reason', '不明')}")
                if outcome.get("tests"):
                    lines.append(f"\n<details><summary>テスト出力</summary>\n\n```\n{outcome['tests']}\n```\n</details>")
    else:
        lines.append("## 実装結果\n\n提案モードのため、コードは変更していません。")

    report = "\n".join(lines)
    REPORT_PATH.write_text(report, encoding="utf-8")
    log(f"レポートを書き出しました: {REPORT_PATH}")
    print("\n" + report)
    return exit_code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        log(f"エラー: {exc}")
        REPORT_PATH.write_text(
            f"# 自動改善レポート\n\n❌ 実行に失敗しました。\n\n```\n{exc}\n```\n", encoding="utf-8"
        )
        sys.exit(1)
