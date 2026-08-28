#!/usr/bin/env node
/** （誤り）付きの誤変換記述を修正 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "../data/judgment-questions.js");
let src = fs.readFileSync(file, "utf8");

function negateSap(text) {
  const rules = [
    [/減らない/g, "減る"],
    [/しない/g, "する"],
    [/できない/g, "できる"],
    [/ではない/g, "である"],
    [/進めない/g, "進める"],
    [/行われない/g, "行われる"],
  ];
  for (const [a, b] of rules) {
    if (a.test(text)) return text.replace(a, b);
  }
  if (text.endsWith("である。")) return text.slice(0, -3) + "ではない。";
  return text.replace(/。$/, "のではない。");
}

const code = src.replace(/const JUDGMENT_DATA/, "var JUDGMENT_DATA");
const sb = {};
vm.runInNewContext(code, sb);

function fmtStatements(stmts) {
  return stmts.map((s) => {
    let line = `      { text: "${s.text.replace(/"/g, '\\"')}", correct: ${s.correct}`;
    if (s.note) line += `, note: "${s.note.replace(/"/g, '\\"')}"`;
    return line + " },";
  }).join("\n");
}

for (const q of sb.JUDGMENT_DATA) {
  if (!q.statements) continue;
  let changed = false;
  const stmts = q.statements.map((s) => {
    if (!s.correct && s.text.includes("（誤り）") && s.note) {
      const clean = s.text.replace(/（誤り）/g, "").trim();
      if (clean === s.note || s.note.startsWith(clean.slice(0, 12))) {
        changed = true;
        return { text: negateSap(s.note), correct: false, note: s.note };
      }
    }
    if (s.text.includes("のではない。") && s.note && !s.correct) {
      changed = true;
      return { text: negateSap(s.note), correct: false, note: s.note };
    }
    return s;
  });
  if (!changed) continue;
  const re = new RegExp(
    `(  \\{ id: "${q.id}", category: "judgment", module: "[^"]+", code: "[^"]+", pick: "(?:correct|incorrect)", priority: \\d+, statements: \\[)\\n[\\s\\S]*?(    \\], explanation: ")[^"]*(" \\},)`
  );
  src = src.replace(re, `$1\n${fmtStatements(stmts)}\n$2${q.explanation}$3`);
}

fs.writeFileSync(file, src);
console.log("Cleaned misconception artifacts.");
