//
// ミックス出題 第3段: 間違えた問題の一覧の札が、他科目では科目の題になる。
// 開いている科目の問題を触らないことは mix-wrong-item-category が見る。
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

describe("他科目の問題では、分野の札の所に科目の題を出す", () => {
  test("読めない分野キーが、科目の題に化ける", () => {
    const h = harness({ currentId: "fe-kamoku-b", mixScreen: TITLES });
    const t = h.table(q("sap", "tcode"));
    expect(t.tcode).toBe("SAP");
    expect(t).not.toBe(h.cats);
  });

  test("もとの表の中身は1つも消えない", () => {
    const h = harness({ currentId: "fe-kamoku-b", mixScreen: TITLES });
    const t = h.table(q("sap", "tcode"));
    expect(t.scenario).toBe("シナリオ");
  });

  test("大域の表そのものは書き換えない", () => {
    const h = harness({ currentId: "fe-kamoku-b", mixScreen: TITLES });
    h.table(q("sap", "tcode"));
    expect(h.cats.tcode).toBe(undefined);
  });

  test("読める分野キーでも、他科目なら科目の題にする", () => {
    const h = harness({ currentId: "fe-kamoku-b", mixScreen: TITLES });
    expect(h.table(q("sap", "scenario")).scenario).toBe("SAP");
  });

  test("題を引く口が無ければ、科目 id を出す", () => {
    const h = harness({ currentId: "fe-kamoku-b" });
    expect(h.table(q("sap", "tcode")).tcode).toBe("sap");
  });
});
