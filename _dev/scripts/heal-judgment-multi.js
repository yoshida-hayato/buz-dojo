#!/usr/bin/env node
/** 壊れた記述を復元し、3正2誤（pick=correct）/ 2正3誤（pick=incorrect）の基準に戻す */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "../data/judgment-questions.js");
let src = fs.readFileSync(file, "utf8");

function healStatement(s) {
  let { text, correct, note } = s;
  if (!correct && note) {
    if (text.includes("（誤り）") || text.includes("すしない") || text.includes("でではない")) {
      return { text: note, correct: true };
    }
  }
  text = text.replace(/すしない/g, "しない").replace(/でではない/g, "ではない").replace(/（誤り）/g, "");
  return { text, correct, note };
}

function dedupeStatements(stmts) {
  const seen = new Set();
  const out = [];
  for (const s of stmts) {
    const key = s.text.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeRatio(stmts, pick) {
  let s = dedupeStatements(stmts.map(healStatement));
  while (s.length < 5) s.push({ text: "（復元エラー）", correct: false });
  if (s.length > 5) s = s.slice(0, 5);

  let trues = s.filter((x) => x.correct);
  let falses = s.filter((x) => !x.correct);
  const wantT = pick === "correct" ? 3 : 2;
  const wantF = 5 - wantT;

  while (trues.length > wantT && falses.length < wantF) {
    const t = trues.pop();
    falses.push({ text: t.text + "（誤り）", correct: false, note: t.text });
  }
  while (falses.length > wantF && trues.length < wantT) {
    const f = falses.pop();
    if (f.note) trues.push({ text: f.note, correct: true });
    else trues.push({ text: f.text, correct: true });
  }
  while (trues.length > wantT) {
    const t = trues.pop();
    falses.push({ text: t.text.replace(/。$/, "のではない。"), correct: false, note: t.text });
  }
  while (falses.length > wantF) {
    const f = falses.shift();
    if (f.note) trues.push({ text: f.note, correct: true });
  }

  return [...trues, ...falses].slice(0, 5);
}

const code = src.replace(/const JUDGMENT_DATA/, "var JUDGMENT_DATA");
const sandbox = {};
vm.runInNewContext(code, sandbox);

function fmtStatements(stmts) {
  return stmts
    .map((s) => {
      let line = `      { text: "${s.text.replace(/"/g, '\\"')}", correct: ${s.correct}`;
      if (s.note) line += `, note: "${s.note.replace(/"/g, '\\"')}"`;
      return line + " },";
    })
    .join("\n");
}

for (const q of sandbox.JUDGMENT_DATA) {
  if (!q.statements) continue;
  const healed = normalizeRatio(q.statements, q.pick);
  const re = new RegExp(
    `(  \\{ id: "${q.id}", category: "judgment", module: "[^"]+", code: "[^"]+", pick: "(?:correct|incorrect)", priority: \\d+, statements: \\[)\\n[\\s\\S]*?(    \\], explanation: ")[^"]*(" \\},)`
  );
  if (!re.test(src)) {
    console.error("Not found:", q.id);
    process.exit(1);
  }
  src = src.replace(re, `$1\n${fmtStatements(healed)}\n$2${q.explanation}$3`);
}

fs.writeFileSync(file, src);
console.log("Healed all multi-select questions to baseline 3/2 ratio.");
