#!/usr/bin/env node
/**
 * 正解数1〜4に分散（各15問前後）。既存の誤り記述を活かし、削減時は反転誤文を生成。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "../data/judgment-questions.js");
let src = fs.readFileSync(file, "utf8");

const code = src.replace(/const JUDGMENT_DATA/, "var JUDGMENT_DATA");
const sandbox = {};
vm.runInNewContext(code, sandbox);
const multi = sandbox.JUDGMENT_DATA.filter((q) => q.statements);
const ids = multi.map((q) => q.id).sort();

const targets = [];
for (let n = 1; n <= 4; n++) for (let i = 0; i < 15; i++) targets.push(n);
const shuffled = targets
  .map((t, i) => ({ t, k: hash(ids[i] + ":" + t) }))
  .sort((a, b) => a.k - b.k)
  .map((x) => x.t);
const targetById = Object.fromEntries(ids.map((id, i) => [id, shuffled[i]]));

// j-063は4正解（KB13含む）を維持
targetById["j-063"] = 4;

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function negateSap(text) {
  const rules = [
    [/減らない/g, "減る"],
    [/しない/g, "する"],
    [/できない/g, "できる"],
    [/ではない/g, "である"],
    [/進めない/g, "進める"],
    [/ない$/g, "ある"],
    [/必ず/g, "決して"],
    [/ない場合がある/g, "常に可能である"],
  ];
  for (const [a, b] of rules) {
    if (a.test(text)) return text.replace(a, b);
  }
  if (text.endsWith("である。")) return text.slice(0, -3) + "ではない。";
  return text.replace(/。$/, "のではない。");
}

function pickCount(stmts, pick) {
  return stmts.filter((s) => (pick === "correct" ? s.correct : !s.correct)).length;
}

function buildVariant(q, target) {
  const pick = q.pick;
  let trues = q.statements.filter((s) => s.correct).map((s) => ({ ...s }));
  let falses = q.statements.filter((s) => !s.correct).map((s) => ({ ...s }));
  const cur = pick === "correct" ? trues.length : falses.length;

  if (cur === target) return q.statements.map((s) => ({ ...s }));

  if (pick === "correct") {
    while (trues.length > target) {
      const t = trues.pop();
      falses.push({ text: negateSap(t.text), correct: false, note: t.text });
    }
    while (trues.length < target && falses.length) {
      const f = falses.shift();
      const text = f.note && f.note.length < 120 ? f.note : f.text;
      if (trues.some((t) => t.text === text)) continue;
      trues.push({ text, correct: true });
    }
  } else {
    while (falses.length > target) {
      const f = falses.shift();
      const text = f.note && f.note.length < 120 ? f.note : f.text;
      if (trues.some((t) => t.text === text)) continue;
      trues.push({ text, correct: true });
    }
    while (falses.length < target && trues.length) {
      const t = trues.pop();
      falses.push({ text: negateSap(t.text), correct: false, note: t.text });
    }
  }

  return [...trues, ...falses].slice(0, 6);
}

function fmtStatements(stmts) {
  return stmts
    .map((s) => {
      let line = `      { text: "${s.text.replace(/"/g, '\\"')}", correct: ${s.correct}`;
      if (s.note) line += `, note: "${s.note.replace(/"/g, '\\"')}"`;
      return line + " },";
    })
    .join("\n");
}

for (const q of multi) {
  const target = targetById[q.id];
  if (pickCount(q.statements, q.pick) === target) continue;
  const newStmts = buildVariant(q, target);
  const re = new RegExp(
    `(  \\{ id: "${q.id}", category: "judgment", module: "[^"]+", code: "[^"]+", pick: "(?:correct|incorrect)", priority: \\d+, statements: \\[)\\n[\\s\\S]*?(    \\], explanation: ")[^"]*(" \\},)`
  );
  if (!re.test(src)) {
    console.error(`Not found: ${q.id}`);
    process.exit(1);
  }
  src = src.replace(re, `$1\n${fmtStatements(newStmts)}\n$2${q.explanation}$3`);
}

// j-063: KB13入り4正解を上書き
const j063Block = `  { id: "j-063", category: "judgment", module: "CO", code: "照会Tコード", pick: "correct", priority: 2, statements: [
      { text: "KS03は原価センタマスタ（定義）の照会である。", correct: true },
      { text: "KSB1は原価センタの実際原価明細照会である。", correct: true },
      { text: "KB13は内部指図の実績明細照会であり、KSB1と同様xB1系の延長である。", correct: true },
      { text: "01/03系はマスタ照会、xB1系は明細照会というパターンがある。", correct: true },
      { text: "KS03で原価センタへの実績金額明細を確認できる。", correct: false, note: "KS03はマスタ照会。実績明細はKSB1。" },
    ], explanation: "KS03＝マスタ、KSB1/KB13＝xB1系明細。01/03系とxB1系の使い分け。" },`;
src = src.replace(
  /  \{ id: "j-063", category: "judgment", module: "CO", code: "照会Tコード",[\s\S]*?explanation: "[^"]*" \},/,
  j063Block
);

fs.writeFileSync(file, src);

vm.runInNewContext(src.replace(/const JUDGMENT_DATA/, "var JUDGMENT_DATA"), sandbox);
const hist = {};
for (const q of sandbox.JUDGMENT_DATA) {
  if (!q.statements) continue;
  const n = pickCount(q.statements, q.pick);
  hist[n] = (hist[n] || 0) + 1;
}
console.log("Distribution:", hist);
