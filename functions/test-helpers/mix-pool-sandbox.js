//
// 混ぜた出題枠 (buildMixedPoolFrom) を本物のまま走らせる足場。
// 試験の中に置くと jest が「試験が1件も無い」で落とすので、ここに置く。
//
// 本物の js を4枚そろえて走らせる。app-state は CHOICE_COUNT を持つので
// 外すと buildQuestion が落ちる (2026-11-15 に実測。失敗の型6 の形で、
// 最初はコードの不具合に見えた)。
// 円記号がパッチの口を通らないので、正規表現は1つも使わない。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const FILES = ["app-state.js", "dom-util.js", "settings-ui.js", "quiz-builder.js"];
// この repo に問題データが在る3科目
const LOCAL_IDS = ["fe-kamoku-a", "fe-kamoku-b", "ap-kamoku-b"];
const EXTRA_FILES = [
  "judgment-questions.js", "order-questions.js", "contrast-questions.js",
];

// data の下の問題データを、本物のまま読む
function entriesOf(id) {
  const dir = path.join(ROOT, "data", id);
  let code = "";
  EXTRA_FILES.forEach((name) => {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) code += fs.readFileSync(f, "utf8") + NL;
  });
  code += fs.readFileSync(path.join(dir, "questions.js"), "utf8");
  const box = {};
  vm.createContext(box);
  vm.runInContext(
    code + NL + ";globalThis.__q = typeof QUIZ_DATA !== 'undefined' ? QUIZ_DATA : [];",
    box
  );
  return box.__q;
}

// 乱数を固定の並びにする。測り直しのたびに同じ肢が出る
function fixedRandom(start) {
  let seed = Number(start) || 12345;
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

