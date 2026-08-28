#!/usr/bin/env node
/**
 * 全問題の priority を data/priority-criteria.js の基準で再計算して書き換える。
 *
 * 使い方:
 *   node scripts/rebalance-priorities.js          # 適用
 *   node scripts/rebalance-priorities.js --dry-run  # 変更プレビューのみ
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { computePriority } = require("../data/priority-criteria.js");

const root = path.join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

function loadData(file, varName) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const sandbox = {};
  vm.runInNewContext(src.replace(`const ${varName}`, `var ${varName}`), sandbox);
  return { src, data: sandbox[varName] };
}

function setPriorityInSrc(src, id, newPri) {
  const re = new RegExp(`(\\{\\s*id:\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?priority:\\s*)\\d`);
  if (!re.test(src)) throw new Error(`priority not found for id=${id}`);
  return src.replace(re, `$1${newPri}`);
}

function countPriorities(items) {
  const c = { 1: 0, 2: 0, 3: 0 };
  items.forEach((q) => c[q.priority]++);
  return c;
}

function rebalanceFile(relPath, varName, source) {
  let { src, data } = loadData(relPath, varName);
  const before = countPriorities(data);
  const changes = [];

  for (const q of data) {
    const next = computePriority(q, source);
    if (q.priority !== next) {
      changes.push({ id: q.id, from: q.priority, to: next, category: q.category, code: q.code });
      if (!dryRun) src = setPriorityInSrc(src, q.id, next);
    }
  }

  if (!dryRun && changes.length) {
    fs.writeFileSync(path.join(root, relPath), src, "utf8");
  }

  const afterData = changes.length && !dryRun ? loadData(relPath, varName).data : data.map((q) => ({
    ...q,
    priority: computePriority(q, source),
  }));
  const after = countPriorities(afterData);

  return { before, after, changes };
}

const quiz = rebalanceFile("data/questions.js", "QUIZ_DATA", "quiz");
const judgment = rebalanceFile("data/judgment-questions.js", "JUDGMENT_DATA", "judgment");

function printReport(label, result) {
  const { before, after, changes } = result;
  console.log(`\n=== ${label} ===`);
  console.log("Before:", before, "total", before[1] + before[2] + before[3]);
  console.log("After: ", after, "total", after[1] + after[2] + after[3]);
  console.log("Changed:", changes.length);
  const byDir = { up: 0, down: 0 };
  changes.forEach((c) => {
    if (c.to < c.from) byDir.up++;
    else if (c.to > c.from) byDir.down++;
  });
  console.log("  → 優先度UP(数字↓):", byDir.up, "  DOWN(数字↑):", byDir.down);
  if (changes.length && changes.length <= 40) {
    changes.forEach((c) => console.log(`  ${c.id}: ${c.from}→${c.to} [${c.category}] ${c.code}`));
  } else if (changes.length) {
    changes.slice(0, 20).forEach((c) => console.log(`  ${c.id}: ${c.from}→${c.to} [${c.category}] ${c.code}`));
    console.log(`  ... 他 ${changes.length - 20} 件`);
  }
}

printReport("QUIZ_DATA", quiz);
printReport("JUDGMENT_DATA", judgment);

if (dryRun) {
  console.log("\n(dry-run: ファイルは変更していません)");
} else {
  console.log("\n適用完了。");
}
