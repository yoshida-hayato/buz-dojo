//
// ミックス出題 第3段: 間違えた問題の一覧の札 (wrongItemCategoryTable)。
// 問題の札と同じ形の2箇所目である (型9: 1箇所目だけ直して終わらせない)。
//
// 札を組む行は囲み付きの文字列なのでパッチの口を通らない。だから読む表の
// ほうを差し替える形にした。開いている科目の問題では、大域とまったく同じ
// 表 (同じ実体) を返すことまで見る。別物を返すと、本番の経路に新しい
// 器が1つ増える。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);

function load(opts) {
  const o = opts || {};
  const sandbox = {
    String, Number, Array, Object, JSON, Set, Map, Math, Date, Function, RegExp,
    console: { warn: () => {}, error: () => {}, log: () => {} },
    document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null },
    QUIZ_DATA: [],
    CATEGORIES: o.categories || { scenario: "シナリオ" },
    CURRENT_SUBJECT: o.currentId ? { id: o.currentId } : null,
  };
  if (o.mixScreen) sandbox.MixScreen = o.mixScreen;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  ["app-state.js", "dom-util.js", "settings-ui.js", "quiz-builder.js"].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), ctx);
  });
  return ctx;
}

function harness(opts) {
  const o = opts || {};
  const ctx = load(o);
  vm.runInContext(
    "globalThis.__cats = " + JSON.stringify(o.categories || { scenario: "シナリオ" }) + ";" +
      NL + "CATEGORIES = globalThis.__cats;" +
      NL + "CURRENT_SUBJECT = " + (o.currentId ? JSON.stringify({ id: o.currentId }) : "null") + ";",
    ctx
  );
  return {
    table: vm.runInContext("wrongItemCategoryTable", ctx),
    cats: vm.runInContext("CATEGORIES", ctx),
  };
}

function q(subjectId, category) {
  return { subjectId: subjectId, entry: { id: "x", category: category, priority: 1 } };
}

const TITLES = { subjectTitleOf: (id) => (id === "sap" ? "SAP" : id) };

describe("開いている科目の問題では、表をまったく差し替えない", () => {
  test("同じ科目なら、大域とまったく同じ実体を返す", () => {
    const h = harness({ currentId: "fe-kamoku-b" });
    expect(h.table(q("fe-kamoku-b", "scenario"))).toBe(h.cats);
  });

  test("科目が分からない問題でも、大域の表をそのまま返す", () => {
    const h = harness({ currentId: "fe-kamoku-b" });
    expect(h.table(q("", "scenario"))).toBe(h.cats);
    expect(h.table(null)).toBe(h.cats);
  });

  test("開いている科目が分からなければ、大域の表をそのまま返す", () => {
    const h = harness({ currentId: "" });
    expect(h.table(q("sap", "tcode"))).toBe(h.cats);
  });

  test("分野を持たない問題でも、大域の表をそのまま返す", () => {
    const h = harness({ currentId: "fe-kamoku-b" });
    expect(h.table({ subjectId: "sap", entry: { id: "x" } })).toBe(h.cats);
  });
});
