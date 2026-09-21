#!/usr/bin/env python3
"""
Slack に投稿された改善パッチを取り込んで適用するブリッジ。

Cowork のスケジュールタスク（Claude）が Slack に PATCH_V1 形式で改善内容を
投稿する。このスクリプトは GitHub Actions 上で動き、それを読み取って適用し、
テストが通った場合のみコミットする（push はワークフロー側が行う）。

PATCH_V1 のメッセージ形式:

    PATCH_V1
    ```
    {"title": "...", "rationale": "...", "path": "js/foo.js",
     "old_string": "...", "new_string": "..."}
    ```

安全装置:
  - 投稿者が ALLOWED_SLACK_USER_ID と一致するメッセージだけを受け付ける
  - old_string がファイル内にちょうど1回だけ現れることを要求する
  - 変更行数の上限（MAX_CHANGED_LINES）
  - テストが通らなければ変更を破棄する
  - 適用済みメッセージの ts を記録し、同じパッチを二度適用しない
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
STATE_PATH = REPO_ROOT / ".agent-state" / "last-applied-ts"

SLACK_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
CHANNEL_ID = os.environ.get("SLACK_CHANNEL_ID", "")
ALLOWED_AUTHOR = os.environ.get("ALLOWED_SLACK_USER_ID", "")
# 暴走を止めるための上限。git diff --numstat は追加行と削除行を合算するため、
# 200 は「実コード100行程度の書き換え」に相当する。
MAX_CHANGED_LINES = int(os.environ.get("MAX_CHANGED_LINES", "200"))

EDITABLE_SUFFIXES = {".js", ".css", ".html", ".md", ".py", ".json", ".rules", ".yml", ".yaml"}
MARKER = "PATCH_V1"


def log(msg: str) -> None:
    print(f"[bridge] {msg}", flush=True)


def run(cmd: list[str], cwd: Path = REPO_ROOT) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


# --------------------------------------------------------------------------
# Slack
# --------------------------------------------------------------------------

def slack_get(method: str, params: dict) -> dict:
    url = f"https://slack.com/api/{method}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {SLACK_TOKEN}"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def slack_post(text: str) -> None:
    payload = json.dumps({"channel": CHANNEL_ID, "text": text}).encode("utf-8")
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=payload,
        headers={
            "Authorization": f"Bearer {SLACK_TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            body = json.loads(res.read().decode("utf-8"))
            if not body.get("ok"):
                log(f"Slack投稿に失敗: {body.get('error')}")
    except Exception as exc:  # noqa: BLE001
        log(f"Slack投稿で例外: {exc}")


def fetch_latest_patch() -> Optional[dict]:
    """最新の PATCH_V1 メッセージを取得して辞書で返す。無ければ None。"""
    body = slack_get("conversations.history", {"channel": CHANNEL_ID, "limit": "30"})
    if not body.get("ok"):
        raise RuntimeError(f"Slack読み取りに失敗しました: {body.get('error')}")

    for msg in body.get("messages", []):  # 新しい順
        text = msg.get("text", "")
        if MARKER not in text:
            continue
        author = msg.get("user", "")
        if ALLOWED_AUTHOR and author != ALLOWED_AUTHOR:
            log(f"投稿者が許可リストと不一致のため無視: {author}")
            continue

        # Slack は & < > をエスケープして返すので戻す
        text = html.unescape(text)
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if not match:
            log("コードブロックが見つからないメッセージをスキップします")
            continue
        try:
            patch = json.loads(match.group(1).strip())
        except json.JSONDecodeError as exc:
            log(f"JSONとして読めませんでした: {exc}")
            continue
        patch["_ts"] = msg.get("ts", "")
        return patch
    return None


# --------------------------------------------------------------------------
# 適用
# --------------------------------------------------------------------------

def already_applied(ts: str) -> bool:
    if not STATE_PATH.exists():
        return False
    last = STATE_PATH.read_text(encoding="utf-8").strip()
    try:
        return float(ts) <= float(last)
    except ValueError:
        return ts == last


def changed_line_count() -> int:
    total = 0
    for line in run(["git", "diff", "--numstat"]).stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            for p in parts[:2]:
                if p.isdigit():
                    total += int(p)
    return total


def run_tests() -> tuple[bool, str]:
    out = []
    log("テスト実行: functions unit tests")
    unit = run(["npm", "test"], cwd=REPO_ROOT / "functions")
    out.append(f"[functions npm test] exit={unit.returncode}\n{unit.stdout[-2000:]}{unit.stderr[-1000:]}")
    if unit.returncode != 0:
        return False, "\n\n".join(out)

    log("テスト実行: firestore rules tests")
    rules = run(["npm", "run", "test:rules"])
    out.append(f"[npm run test:rules] exit={rules.returncode}\n{rules.stdout[-2000:]}{rules.stderr[-1000:]}")
    if rules.returncode != 0:
        return False, "\n\n".join(out)

    return True, "\n\n".join(out)


def revert_all() -> None:
    run(["git", "checkout", "--", "."])


def main() -> int:
    for name, value in [
        ("SLACK_BOT_TOKEN", SLACK_TOKEN),
        ("SLACK_CHANNEL_ID", CHANNEL_ID),
    ]:
        if not value:
            log(f"{name} が未設定です。GitHub Secrets / workflow env を確認してください。")
            return 1

    patch = fetch_latest_patch()
    if patch is None:
        log("適用できるパッチはありませんでした。")
        return 0

    ts = patch.get("_ts", "")
    if already_applied(ts):
        log(f"このパッチ（ts={ts}）は適用済みです。何もしません。")
        return 0

    title = str(patch.get("title", "(無題)"))
    rationale = str(patch.get("rationale", ""))
    rel_path = str(patch.get("path", ""))
    old_string = patch.get("old_string", "")
    new_string = patch.get("new_string", "")

    if not rel_path or not isinstance(old_string, str) or not isinstance(new_string, str):
        slack_post(f"❌ パッチの形式が不正です（path / old_string / new_string を確認してください）: {title}")
        return 0
    if old_string == new_string:
        slack_post(f"⏭ old_string と new_string が同一のため何もしませんでした: {title}")
        return 0

    target = (REPO_ROOT / rel_path).resolve()
    try:
        target.relative_to(REPO_ROOT)
    except ValueError:
        slack_post(f"❌ リポジトリ外のパスは拒否しました: `{rel_path}`")
        return 0
    if not target.is_file():
        slack_post(f"❌ ファイルが見つかりません: `{rel_path}`")
        return 0
    if target.suffix not in EDITABLE_SUFFIXES:
        slack_post(f"❌ 対象外の拡張子です: `{rel_path}`")
        return 0

    content = target.read_text(encoding="utf-8")
    occurrences = content.count(old_string)
    if occurrences == 0:
        slack_post(
            f"❌ 置換対象の文字列が見つかりませんでした: `{rel_path}`\n"
            f"（コードが変わった可能性があります。次回の提案で作り直されます）\n> {title}"
        )
        return 0
    if occurrences > 1:
        slack_post(
            f"❌ 置換対象の文字列が{occurrences}箇所あり、一意に定まりません: `{rel_path}`\n> {title}"
        )
        return 0

    target.write_text(content.replace(old_string, new_string, 1), encoding="utf-8")
    lines = changed_line_count()
    if lines > MAX_CHANGED_LINES:
        revert_all()
        slack_post(f"❌ 変更が大きすぎます（{lines}行 > 上限{MAX_CHANGED_LINES}行）。破棄しました。\n> {title}")
        return 0

    log(f"適用: {rel_path}（{lines}行）— {title}")
    passed, test_output = run_tests()
    if not passed:
        revert_all()
        tail = test_output[-1200:]
        slack_post(
            f"❌ テストが失敗したため変更を破棄しました。\n> {title} (`{rel_path}`)\n```{tail}```"
        )
        return 0

    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(ts + "\n", encoding="utf-8")

    run(["git", "add", rel_path, str(STATE_PATH.relative_to(REPO_ROOT))])
    message = (
        f"auto: {title}\n\n{rationale}\n\n"
        f"変更ファイル: {rel_path}（{lines}行）\n"
        f"テスト: functions unit + firestore rules すべて成功\n"
        f"出典: Slack パッチ ts={ts}"
    )
    commit = run(["git", "commit", "-m", message])
    if commit.returncode != 0:
        revert_all()
        slack_post(f"❌ コミットに失敗しました: {commit.stderr[:400]}")
        return 1

    slack_post(
        f"✅ mainに反映しました（テスト全通過）\n"
        f"> *{title}*\n> `{rel_path}` / {lines}行変更\n> {rationale[:300]}"
    )
    log("コミットを作成しました。push はワークフローが行います。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        log(f"エラー: {exc}")
        if SLACK_TOKEN and CHANNEL_ID:
            slack_post(f"❌ ブリッジの実行に失敗しました:\n```{exc}```")
        sys.exit(1)
