//
// 出題プールを組む所が、大域を1つも読まないことの見張り
// (js/settings-ui.js の buildPoolFrom。ミックス出題 第2段)。
//
// なぜ要るか。全科目ミックスでは科目ごとの問題と科目ごとの成績が要るのに、
// buildPool は開いている1科目の QUIZ_DATA と QuizStorage だけを見ていた。
// 混ぜるには、どの集合を使うかを呼ぶ側が決められないといけない。
// 2026-11-14 に、集合を受ける buildPoolFrom と、大域と DOM を集める薄い
// 包み (buildPool) に分けた。本番の動きは変わっていない (3科目の実データで
// 出題対象4通り x 解答方式3通り x 絞りの有無2通りの72組を走らせ、
// 2,582枠が1件も違わないことを確かめた)。
//
// ここが見るのは2つだけ:
//   (1) buildPoolFrom が大域を素で読まない。読んだら混ぜられない
//   (2) 集合を渡せば、渡した集合だけで組む (渡さなければ空になる)
// 円記号がパッチの口を通らないので、正規表現は1つも使わない。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const UI = fs.readFileSync(path.join(ROOT, "js", "settings-ui.js"), "utf8");
const PURE_FN = "function buildPoolFrom(settings, source) {";
const NL = String.fromCharCode(10);

// buildPoolFrom が素で読んではいけない名前
const GLOBALS = [
  "QUIZ_DATA",
  "QuizStorage",
  "INPUT_CATEGORIES",
  "MODULE_FILTERABLE",
  "document",
];

function pureSource() {
  const i = UI.indexOf(PURE_FN);
  if (i < 0) throw new Error("buildPoolFrom が見つからない");
  return UI.slice(i, UI.indexOf(NL + "}" + NL, i) + 3);
}

// 大域を1つも渡さない器で走らせる。素で読んでいれば ReferenceError で落ちる
function runPure(settings, source) {
  const ctx = { Array, Set, Boolean, String, Number, Object };
  vm.createContext(ctx);
  vm.runInContext(pureSource() + NL + ";globalThis.__P = buildPoolFrom;", ctx);
  return ctx.__P(settings, source);
}

const DATA = ["q1", "q2", "q3"].map((id) => ({
  id,
  category: "term",
  priority: 1,
  module: "m1",
}));
const SETTINGS = {
  poolMode: "all",
  answerMode: "choice",
  categories: ["term"],
  priorities: [1],
  modules: "all",
};

describe("約束1: buildPoolFrom は大域を素で読まない", () => {
  test("大域を1つも渡さない器で、渡した集合だけで組める", () => {
    const slots = runPure(SETTINGS, { entries: DATA });
    expect(slots.map((s) => s.entry.id)).toEqual(["q1", "q2", "q3"]);
  });

  test("器が本当に空である (足場の検算)", () => {
    // これが無いと、器にたまたま大域が在っても上の1件が通る
    const ctx = { Array, Set, Boolean, String, Number, Object };
    vm.createContext(ctx);
    GLOBALS.forEach((n) => {
      const seen = vm.runInContext("typeof " + n + ";", ctx);
      expect(seen).toBe("undefined");
    });
  });

  test("字面にも大域の名前が1つも無い", () => {
    const src = pureSource();
    const found = GLOBALS.filter((n) => src.indexOf(n) !== -1);
    expect(found).toEqual([]);
  });
});

describe("約束2: 渡した集合だけで組む", () => {
  test("集合を渡さなければ空になる (前の科目の問題が残らない)", () => {
    expect(runPure(SETTINGS, {})).toEqual([]);
    expect(runPure(SETTINGS, undefined)).toEqual([]);
  });

  test("習得済みの集合を渡せば、未習得だけになる", () => {
    const s = Object.assign({}, SETTINGS, { poolMode: "unmastered" });
    const slots = runPure(s, { entries: DATA, choiceMastered: new Set(["q2"]) });
    expect(slots.map((x) => x.entry.id)).toEqual(["q1", "q3"]);
  });

  test("間違えた問題の集合を渡せば、それだけになる", () => {
    const s = Object.assign({}, SETTINGS, { poolMode: "wrong" });
    const slots = runPure(s, { entries: DATA, wrongIds: new Set(["q3"]) });
    expect(slots.map((x) => x.entry.id)).toEqual(["q3"]);
  });

  test("解いた問題の集合を渡せば、それを外す", () => {
    const s = Object.assign({}, SETTINGS, { poolMode: "untouched" });
    const slots = runPure(s, { entries: DATA, answeredIds: new Set(["q1", "q2"]) });
    expect(slots.map((x) => x.entry.id)).toEqual(["q3"]);
  });

  test("科目の違う2つの集合を続けて渡しても、混ざらない", () => {
    // ミックスで要るのはこの性質である。1度目の呼び出しの集合が
    // 2度目に残っていたら、別科目の問題が出る
    const other = [{ id: "z1", category: "term", priority: 1, module: "m1" }];
    expect(runPure(SETTINGS, { entries: DATA }).length).toBe(3);
    expect(runPure(SETTINGS, { entries: other }).map((s) => s.entry.id)).toEqual(["z1"]);
  });
});
