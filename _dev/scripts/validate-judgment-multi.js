#!/usr/bin/env node
/** 複数選択正誤: 記述4本以上・選ぶ個数1以上・正誤どちらも1本以上 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "../data/judgment-questions.js");
const code = fs.readFileSync(file, "utf8").replace(/const JUDGMENT_DATA/, "var JUDGMENT_DATA");
const sandbox = {};
vm.runInNewContext(code, sandbox);
const data = sandbox.JUDGMENT_DATA;

let ok = true;
for (const q of data) {
  if (!q || !q.statements) continue;
  const n = q.statements.length;
  const trues = q.statements.filter((s) => s.correct).length;
  const falses = n - trues;
  const pickN = q.pick === "correct" ? trues : falses;
  const issues = [];
  if (n < 4) issues.push(`記述数${n}（4以上想定）`);
  if (pickN < 1) issues.push(`選択数${pickN}（1以上想定）`);
  if (trues < 1 || falses < 1) issues.push(`正${trues}/誤${falses}（各1以上想定）`);
  if (issues.length) {
    ok = false;
    console.log(`${q.id} [${q.code}] pick=${q.pick}: ${issues.join(", ")}`);
  }
}
if (ok) console.log("OK: 複数選択の最低条件を満たしています。");
process.exit(ok ? 0 : 1);
