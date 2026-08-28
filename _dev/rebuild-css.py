#!/usr/bin/env python3
"""css/*.css を css/style.css に結合する（編集は分割ファイル側）"""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
order = ["base.css","header.css","rank.css","quiz.css","stats.css","admin.css","browsers.css","subjects.css","mypage.css"]
parts = []
parts.append("/* style.css — concatenated from css/*.css (run: python3 _dev/rebuild-css.py) */\n")
for g in order:
    p = root / "css" / g
    parts.append(f"\n/* ---- {g} ---- */\n")
    parts.append(p.read_text())
(root / "css" / "style.css").write_text("".join(parts))
print("wrote css/style.css")
