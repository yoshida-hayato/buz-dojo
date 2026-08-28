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
print("wrote", dst.relative_to(root))
