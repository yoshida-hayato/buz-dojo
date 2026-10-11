#!/usr/bin/env python3
#
# 公開直前に キャッシュ鍵 APP_VERSION を作る (firebase.json の hosting.predeploy から呼ばれる)。
#
# なぜ要るか: firebase.json は js css subjects data config assets を
# max-age=31536000 immutable で配る。再訪ユーザーのブラウザが1年掴む形で、
# 避ける唯一の鍵が index.html の ?v=APP_VERSION である。2026-10-11 は13件の
# コミットが入ったのに鍵が前日のままで、再訪ユーザーには1バイトも届かなかった。
#
# なぜ時刻ではなく中身の指紋から作るか: 鍵が動くとスマホでは問題読込の前に
# 更新ポップアップが出る (js/app-chrome.js の ensureAppUpdateBeforeLoad)。
# 時刻由来だと中身が1バイトも変わらない日にも出る。毎時パッチが入る運用では
# 1日に何度も出てポップアップの意味が消えるので、中身が変わった時だけ動かす。
#
# 直前の鍵は本番から読む。predeploy の書き込みは commit できず repo 側は必ず
# ずれるので、いま利用者が握っている値のほうが正しい。指紋が一致したらその値を
# そのまま書き戻す (鍵が動かない = ポップアップが出ない)。本番が読めなければ
# 日付つきの新しい値を書く (最悪ポップアップが1回余分に出るだけ)。
#
# 何があっても終了コード0で抜ける。鍵が1回古いことより、デプロイ全体が
# 止まることのほうが害が大きい。
#
import hashlib
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "buz-dojo" + "." + "web" + "." + "app"
LIVE = "https" + "://" + HOST + "/config/version.js"
Q = chr(34)
# 鍵で守る側 = firebase.json が immutable で配っているディレクトリ
GUARDED = ("js", "css", "subjects", "data", "config", "assets")
# 鍵そのものは指紋に入れない (自分を数えると値が決まらない)
SKIP = ("config/version.js", "data/version.js")
HEAD_MAIN = "// キャッシュ鍵。_dev/gen-version.py が公開直前に書き換える (中身の指紋から作る)\n"
HEAD_SHIM = "// 互換シム。本体は config/version.js。_dev/gen-version.py が両方を書く\n"


def fingerprint():
    rels = []
    for top in GUARDED:
        here = os.path.join(ROOT, top)
        if not os.path.isdir(here):
            continue
        for base, dirs, names in os.walk(here):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "node_modules")
            for name in sorted(names):
                if name.startswith("."):
                    continue
                rel = os.path.relpath(os.path.join(base, name), ROOT).replace(os.sep, "/")
                if rel not in SKIP:
                    rels.append(rel)
    h = hashlib.sha256()
    for rel in sorted(rels):
        with open(os.path.join(ROOT, rel), "rb") as fh:
            h.update(rel.encode("utf-8"))
            h.update(b"\x00")
            h.update(fh.read())
    print("gen-version: fingerprint over " + str(len(rels)) + " files")
    return h.hexdigest()[:10]


def value_in(text):
    i = text.find("APP_VERSION = ")
    if i < 0:
        return ""
    a = text.find(Q, i)
    b = text.find(Q, a + 1) if a >= 0 else -1
    return text[a + 1:b] if b > a >= 0 else ""


def live_value():
    try:
        with urllib.request.urlopen(LIVE, timeout=10) as res:
            return value_in(res.read().decode("utf-8"))
    except Exception as err:
        print("gen-version: live key unreadable (" + str(err) + ")")
        return ""


def jst_date():
    try:
        env = dict(os.environ)
        env["TZ"] = "Asia/Tokyo"
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cd", "--date=format-local:%Y-%m-%d"],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=10,
        )
        stamp = out.stdout.strip()
        if out.returncode == 0 and len(stamp) == 10:
            return stamp
    except Exception:
        pass
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 32400))


def write(rel, head, value):
    with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as fh:
        fh.write(head + "const APP_VERSION = " + Q + value + Q + ";\n")
    print("gen-version: wrote " + rel + " = " + value)


def main():
    digest = fingerprint()
    old = live_value()
    if old and old.endswith("-v" + digest):
        value = old
        print("gen-version: unchanged (" + value + ")")
    else:
        value = jst_date() + "-v" + digest
        print("gen-version: new key " + value + " (was " + (old or "unknown") + ")")
    write("config/version.js", HEAD_MAIN, value)
    write("data/version.js", HEAD_SHIM, value)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print("gen-version: skipped (" + str(err) + ")")
    sys.exit(0)
