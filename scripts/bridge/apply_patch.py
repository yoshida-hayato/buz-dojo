#!/usr/bin/env python3
"""
Slack に投稿された改善パッチを取り込んで適用するブリッジ。

Cowork のスケジュールタスク（Claude）が Slack に PATCH_V1 形式で改善内容を
投稿する。このスクリプトは GitHub Actions 上で動き、未適用のパッチを
古い順にすべて処理し、テストが通ったものだけをコミットする
（push はワークフロー側が行う）。

PATCH_V1 のメッセージ形式（3種類）:

  1) 置換 — 既存ファイルの一部を書き換える
     {"title","rationale","path","old_string","new_string"}

  2) 新規作成 — old_string を空文字にすると新しいファイルを作る
     {"title","rationale","path","old_string":"","new_string":"<ファイル全体>"}

  3) 追記 — append を使うと末尾に追記する（ファイルが無ければ作る）
     {"title","rationale","path","append":"<追記する文字列>"}

安全装置:
  - 投稿者が ALLOWED_SLACK_USER_ID と一致するメッセージだけを受け付ける
  - 置換の場合、old_string がちょうど1回だけ現れることを要求する
  - 1件ごとに変更行数の上限（MAX_CHANGED_LINES）をチェックする
  - テストが通らなければその1件を破棄する（後続のパッチは処理を続ける）
  - 処理済みメッセージの ts を記録し、同じパッチを二度適用しない
  - 失敗したパッチも「処理済み」として先に進む（無限に再試行しない）
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

REPO_ROOT = Path(__file__).resolve().parents[2]
STATE_PATH = REPO_ROOT / ".agent-state" / "last-applied-ts"

SLACK_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
CHANNEL_ID = os.environ.get("SLACK_CHANNEL_ID", "")
ALLOWED_AUTHOR = os.environ.get("ALLOWED_SLACK_USER_ID", "")

# 暴走を止めるための上限。git diff --numstat は追加行と削除行を合算するため、
# 200 は「実コード100行程度の書き換え」に相当する。
MAX_CHANGED_LINES = int(os.environ.get("MAX_CHANGED_LINES", "200"))
# 1回の実行で処理するパッチの最大件数
MAX_PATCHES_PER_RUN = int(os.environ.get("MAX_PATCHES_PER_RUN", "5"))

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


def last_processed_ts() -> float:
    if not STATE_PATH.exists():
        return 0.0
    try:
        return float(STATE_PATH.read_text(encoding="utf-8").strip())
    except (ValueError, OSError):
        return 0.0


def fetch_pending_patches(since_ts: float) -> list[dict]:
    """since_ts より新しい PATCH_V1 を、古い順に返す。"""
    body = slack_get("conversations.history", {"channel": CHANNEL_ID, "limit": "50"})
    if not body.get("ok"):
        raise RuntimeError(f"Slack読み取りに失敗しました: {body.get('error')}")

    patches = []
    for msg in body.get("messages", []):  # 新しい順で返ってくる
        text = msg.get("text", "")
        if MARKER not in text:
            continue
        ts = msg.get("ts", "")
        try:
            if float(ts) <= since_ts:
                continue
        except ValueError:
            continue
        if ALLOWED_AUTHOR and msg.get("user", "") != ALLOWED_AUTHOR:
            log(f"投稿者が許可リストと不一致のため無視: {msg.get('user', '')}")
            continue

        # Slack は & < > をエスケープして返すので戻す
        text = html.unescape(text)
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if not match:
            log(f"コードブロックが見つからないメッセージをスキップ (ts={ts})")
            continue
        try:
            patch = json.loads(match.group(1).strip())
        except json.JSONDecodeError as exc:
            log(f"JSONとして読めませんでした (ts={ts}): {exc}")
            slack_post(f"❌ パッチのJSONが壊れています (ts={ts}): {exc}")
            continue
        patch["_ts"] = ts
        patches.append(patch)

    patches.sort(key=lambda p: float(p["_ts"]))  # 古い順
    return patches[:MAX_PATCHES_PER_RUN]


# --------------------------------------------------------------------------
# 適用
# --------------------------------------------------------------------------

def changed_line_count() -> int:
    """追跡済みファイルの差分行数 + 新規作成ファイルの行数。"""
    total = 0
    for line in run(["git", "diff", "--numstat", "HEAD"]).stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            for p in parts[:2]:
                if p.isdigit():
                    total += int(p)
    # 新規作成ファイルは git diff に出ないので別途数える
    untracked = run(["git", "ls-files", "--others", "--exclude-standard"]).stdout.split()
    for rel in untracked:
        path = REPO_ROOT / rel
        try:
            total += len(path.read_text(encoding="utf-8").splitlines())
        except (OSError, UnicodeDecodeError):
            continue
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


def discard_changes() -> None:
    run(["git", "checkout", "--", "."])
    run(["git", "clean", "-fd", "--", "docs", "js", "css", "functions", "scripts", "subjects", "config"])


def resolve_target(rel_path: str) -> tuple[Path | None, str]:
    """パスを検証して絶対パスを返す。問題があれば (None, 理由)。"""
    if not rel_path:
        return None, "path が空です"
    target = (REPO_ROOT / rel_path).resolve()
    try:
        target.relative_to(REPO_ROOT)
    except ValueError:
        return None, f"リポジトリ外のパスは拒否しました: `{rel_path}`"
    if target.suffix not in EDITABLE_SUFFIXES:
        return None, f"対象外の拡張子です: `{rel_path}`"
    parts = target.relative_to(REPO_ROOT).parts
    # ワークフロー(.github/)の変更は許可する。テストを通過した場合のみ
    # コミットされるため、ここは通常の変更と同じ扱いでよい。
    #
    # 一方 scripts/bridge/ は、このスクリプト自身が住んでいる場所なので
    # 書き換えを許さない。ここが自己改変できると、壊れたパッチを自分に
    # 当てた時点でブリッジが動かなくなり、以後どんなパッチも適用できなく
    # なる(復旧には人間の push が必要になる)。安全装置の問題ではなく、
    # 自分の足場を自分で外せないようにするための制限。
    if len(parts) >= 2 and parts[0] == "scripts" and parts[1] == "bridge":
        return None, "`scripts/bridge/` 配下は、ブリッジ自身なので自動適用の対象外です"
    return target, ""


def write_patch(patch: dict) -> tuple[bool, str, str]:
    """ファイルへ書き込む。(成功, 説明, 理由) を返す。"""
    rel_path = str(patch.get("path", ""))
    target, reason = resolve_target(rel_path)
    if target is None:
        return False, "", reason

    append_text = patch.get("append")

    # 追記モード
    if isinstance(append_text, str) and append_text:
        existing = target.read_text(encoding="utf-8") if target.is_file() else ""
        if existing and not existing.endswith("\n"):
            existing += "\n"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(existing + append_text.rstrip("\n") + "\n", encoding="utf-8")
        return True, f"追記 ({len(append_text)}文字)", ""

    old_string = patch.get("old_string")
    new_string = patch.get("new_string")
    if not isinstance(new_string, str):
        return False, "", "new_string がありません"

    # 新規作成モード（old_string が空、かつファイルが未作成）
    if not old_string:
        if target.is_file():
            return False, "", f"既に存在するファイルです: `{rel_path}`（置換するなら old_string を指定）"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(new_string if new_string.endswith("\n") else new_string + "\n", encoding="utf-8")
        return True, "新規作成", ""

    # 置換モード
    if not target.is_file():
        return False, "", f"ファイルが見つかりません: `{rel_path}`"
    if not isinstance(old_string, str):
        return False, "", "old_string の形式が不正です"
    content = target.read_text(encoding="utf-8")
    occurrences = content.count(old_string)
    if occurrences == 0:
        return False, "", f"置換対象の文字列が見つかりません: `{rel_path}`（コードが変わった可能性があります）"
    if occurrences > 1:
        return False, "", f"置換対象が{occurrences}箇所あり一意に定まりません: `{rel_path}`"
    if old_string == new_string:
        return False, "", "old_string と new_string が同一です"
    target.write_text(content.replace(old_string, new_string, 1), encoding="utf-8")
    return True, "置換", ""


def process_patch(patch: dict) -> bool:
    """1件処理する。コミットできたら True。"""
    title = str(patch.get("title", "(無題)"))
    rationale = str(patch.get("rationale", ""))
    rel_path = str(patch.get("path", ""))

    ok, how, reason = write_patch(patch)
    if not ok:
        discard_changes()
        slack_post(f"❌ 適用できませんでした: {reason}\n> {title}")
        return False

    lines = changed_line_count()
    if lines > MAX_CHANGED_LINES:
        discard_changes()
        slack_post(f"❌ 変更が大きすぎます（{lines}行 > 上限{MAX_CHANGED_LINES}行）。破棄しました。\n> {title}")
        return False

    log(f"適用({how}): {rel_path} — {title}")
    passed, test_output = run_tests()
    if not passed:
        discard_changes()
        slack_post(
            f"❌ テストが失敗したため破棄しました。\n> {title} (`{rel_path}`)\n```{test_output[-1200:]}```"
        )
        return False

    run(["git", "add", "-A", rel_path])
    message = (
        f"auto: {title}\n\n{rationale}\n\n"
        f"変更ファイル: {rel_path}（{how} / {lines}行）\n"
        f"テスト: functions unit + firestore rules すべて成功\n"
        f"出典: Slack パッチ ts={patch.get('_ts', '')}"
    )
    commit = run(["git", "commit", "-m", message])
    if commit.returncode != 0:
        discard_changes()
        slack_post(f"❌ コミットに失敗しました: {commit.stderr[:400]}\n> {title}")
        return False

    slack_post(
        f"✅ mainに反映しました（{how} / {lines}行 / テスト全通過）\n"
        f"> *{title}*\n> `{rel_path}`\n> {rationale[:300]}"
    )
    return True


def save_state(ts: str) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(str(ts) + "\n", encoding="utf-8")
    run(["git", "add", str(STATE_PATH.relative_to(REPO_ROOT))])
    run(["git", "commit", "-m", f"chore: ブリッジの処理位置を更新 (ts={ts})"])


def main() -> int:
    for name, value in [("SLACK_BOT_TOKEN", SLACK_TOKEN), ("SLACK_CHANNEL_ID", CHANNEL_ID)]:
        if not value:
            log(f"{name} が未設定です。")
            return 1

    since = last_processed_ts()
    patches = fetch_pending_patches(since)
    if not patches:
        log(f"未適用のパッチはありません (since={since})")
        return 0

    log(f"未適用のパッチ {len(patches)} 件を古い順に処理します")
    applied = 0
    last_ts = ""
    for patch in patches:
        if process_patch(patch):
            applied += 1
        # 成功・失敗にかかわらず処理済みとして先に進む（無限再試行を避ける）
        last_ts = patch.get("_ts", "")

    if last_ts:
        save_state(last_ts)

    log(f"完了: {applied}/{len(patches)} 件をコミットしました")
    if len(patches) > 1:
        slack_post(f"今回の処理: {len(patches)}件中 {applied}件をmainに反映しました。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        log(f"エラー: {exc}")
        if SLACK_TOKEN and CHANNEL_ID:
            slack_post(f"❌ ブリッジの実行に失敗しました:\n```{exc}```")
        sys.exit(1)
