#!/usr/bin/env node
/**
 * 既存問題の品質ソフト監査（SAP道場）
 *
 * デプロイ必須ゲートではない（件数が多いため警告用途）。
 * 優先して直す候補を洗い出す。
 *
 * 使い方:
 *   node tools/audit-quality.js
 *   node tools/audit-quality.js --limit 40
 *   node tools/audit-quality.js --module FI
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) || 40 : 40;
})();
const MODULE = (() => {
  const i = process.argv.indexOf("--module");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const DISTANT_RE =
  /人事評価|勤怠集計|組織図の階層|タレントマネジメント|給与明細|eリクルーティング|学習管理/;

function load() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "data", "questions.js"),
    "utf8"
  );
  return vm.runInNewContext(src + "\n; QUIZ_DATA;", {}) || [];
}

function len(s) {
  return [...String(s || "")].length;
}

function main() {
  const data = load().filter((q) => q && q.category === "scenario");
  const filtered = MODULE
    ? data.filter((q) => q.module === MODULE)
    : data;

  const short = [];
  const distant = [];

  for (const q of filtered) {
    if (!Array.isArray(q.choices) || q.choices.length < 3) continue;
    const el = len(q.explanation);
    if (el > 0 && el < 80) {
      short.push({ id: q.id, code: q.code || "", module: q.module, el });
    }
    const wrongs = q.choices.slice(1).join(" ");
    const correct = q.choices[0] + " " + (q.explanation || "");
    if (DISTANT_RE.test(wrongs) && !DISTANT_RE.test(correct)) {
      distant.push({ id: q.id, code: q.code || "", module: q.module });
    }
  }

  short.sort((a, b) => a.el - b.el || a.id.localeCompare(b.id));

  console.log(`scenario 総数（対象）: ${filtered.length}`);
  console.log(`解説が短い（<80字）: ${short.length}${short.length === 0 ? "（OK）" : " ← 要修正"}`);
  console.log(`場違い誤答の疑い: ${distant.length}`);
  if (short.length) {
    console.log(`\n【解説短い候補 TOP ${Math.min(LIMIT, short.length)}】`);
    for (const h of short.slice(0, LIMIT)) {
      console.log(`  ${h.id} [${h.module}/${h.code}] expl=${h.el}字`);
    }
  }
  if (distant.length) {
    console.log(`\n【場違い誤答の疑い】（要検討・優先度低）`);
    for (const h of distant.slice(0, LIMIT)) {
      console.log(`  ${h.id} [${h.module}/${h.code}]`);
    }
  }
  console.log(
    `\nヒント: 解説は用語の定義で80字以上。「取り違え注意」定型は使わない。`
  );
}

main();
