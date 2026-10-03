#!/usr/bin/env python3
"""config/pricing.js を functions/pricing-shared.js へ同期する"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "config" / "pricing.js"
dst = root / "functions" / "pricing-shared.js"
text = src.read_text()
header = (
    "/** AUTO-GENERATED from config/pricing.js — edit the source, then run:\n"
    " *  python3 _dev/sync-shared.py\n"
    " */\n"
)
dst.write_text(header + text)
rel = dst.relative_to(root)
print("wrote", rel)

# CI の中だけ、生成した写しを git の index に載せる。
# 理由: ブリッジ (scripts/bridge/apply_patch.py) は npm test を走らせたあと、
# そのパッチの path だけを git add して commit する。config/pricing.js を変える
# パッチが入ると pretest がこの写しを書き換えるのに、写しは未ステージのまま残る。
# ワークフローの push 手順は git pull --rebase を先に叩くので、未ステージの変更が
# あると「cannot pull with rebase」で push ごと落ちる (2026-10-03 に実際に起きた)。
# index に載せておけば、そのパッチの commit に写しも含まれ、ツリーが汚れない。
# 手元では何もしないので、社長の作業や firebase deploy の predeploy には影響しない。
import os

if os.environ.get("GITHUB_ACTIONS") == "true":
    import subprocess

    subprocess.run(["git", "add", "--", str(rel)], cwd=str(root), capture_output=True)
