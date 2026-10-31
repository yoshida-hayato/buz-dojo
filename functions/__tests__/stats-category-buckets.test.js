//
// 成績画面「カテゴリ別」の器のガード (js/stats-analysis.js の categoryStatsRows)。
//
// なぜ要るか: 2026-10-31 に実測した。器が SAP の7つの字面で手書きされており、
// 科目定義に在る 並べ替え (order)・対比 (contrast)・手順の並べ替え (reorder)・
// 穴埋め (cloze) の問題が if (!b) return; で黙って捨てられていた。
// 生産管理の3科目は order と contrast を持ち (subjects/biz-career/subject.js)、
// js/subject-loader.js が ORDER_DATA と CONTRAST_DATA を QUIZ_DATA に push
// するので、解いても成績に1問も出ない状態だった。
// 行の字面も SAP 固定 (SAP用語) で、生産管理の成績画面にそう出ていた。
//
// 見張る約束は2つ:
//   (1) カテゴリ別の問題数の合計は、必ず QUIZ_DATA の件数と一致する
//   (2) 行の名前は科目定義の CATEGORIES から来る
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "stats-analysis.js"), "utf8");
const NL = String.fromCharCode(10);

const SAP_CATS = {
  tcode: "トランザクションコード",
  shortcut: "ショートカット・コマンド",
  term: "SAP用語",
  scenario: "実践・シナリオ",
  judgment: "正誤問題",
  abbr: "略称・正式名称",
  reorder: "手順の並べ替え",
  cloze: "穴埋め（タップ）",
};

const SEISAN_CATS = {
  term: "用語",
  scenario: "シナリオ",
  judgment: "正誤問題",
  order: "並べ替え",
  contrast: "対比",
  abbr: "略称・正式名称",
};

function load(opts) {
  const o = opts || {};
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set,
    console: { warn: () => {}, error: () => {} },
    document: { createElement: () => ({ classList: { add: () => {} } }) },
    QUIZ_DATA: o.quiz || [],
    QuizStorage: { isChoiceMastered: (s) => (s && (s.ck || 0) >= 2) || false },
  };
  if (o.cats !== null) sandbox.CATEGORIES = o.cats || {};
  if (o.inputCats !== null) sandbox.INPUT_CATEGORIES = new Set(o.inputCats || []);
  const ctx = vm.createContext(sandbox);
  return vm.runInContext(SRC + NL + "; StatsAnalysis;", ctx);
}

// カテゴリを並べて問題を作る。id は重ならないようにする
function quizOf(cats) {
  return cats.map((c, i) => ({
    id: c + "-" + i,
    category: c,
    module: "共通",
    code: "C" + i,
    name: "問" + i,
    priority: 1,
    choices: ["正", "誤"],
    explanation: "解説",
  }));
}

// 分割された記述式の行は二重に数えないで合計する
function totalOf(rows) {
  return rows
    .filter((r) => r.key.slice(-6) !== "_input")
    .reduce((n, r) => n + r.total, 0);
}

function byKey(rows) {
  const m = {};
  rows.forEach((r) => (m[r.key] = r));
  return m;
}

describe("成績画面のカテゴリ別の器", () => {
  test("生産管理: 並べ替えと対比が行として出る", () => {
    const quiz = quizOf(["term", "scenario", "judgment", "order", "contrast", "abbr"]);
    const sa = load({ cats: SEISAN_CATS, inputCats: [], quiz });
    const rows = sa.categoryStatsRows({ q: {} });
    const m = byKey(rows);
    expect(Object.keys(m).sort()).toEqual(
      ["abbr", "contrast", "judgment", "order", "scenario", "term"]
    );
    expect(m.order.label).toBe("並べ替え");
    expect(m.contrast.label).toBe("対比");
    expect(totalOf(rows)).toBe(quiz.length);
  });

  test("生産管理: 用語の行に SAP と書かない", () => {
    const sa = load({ cats: SEISAN_CATS, inputCats: [], quiz: quizOf(["term"]) });
    const rows = sa.categoryStatsRows({ q: {} });
    expect(rows[0].label).toBe("用語");
    expect(rows[0].label.indexOf("SAP")).toBe(-1);
  });

  test("SAP: 手順の並べ替えと穴埋めが行として出る", () => {
    const quiz = quizOf(["tcode", "term", "scenario", "judgment", "abbr", "shortcut", "reorder", "cloze"]);
    const sa = load({ cats: SAP_CATS, inputCats: ["tcode"], quiz });
    const rows = sa.categoryStatsRows({ q: {} });
    const m = byKey(rows);
    expect(m.reorder.label).toBe("手順の並べ替え");
    expect(m.cloze.label).toBe("穴埋め（タップ）");
    expect(m.tcode_choice.label).toBe("Tコード（選択式）");
    expect(m.tcode_input.label).toBe("Tコード（記述式）");
    expect(m.tcode).toBe(undefined);
    expect(totalOf(rows)).toBe(quiz.length);
  });

  test("合計は必ず QUIZ_DATA の件数に一致する (科目定義に無いカテゴリも落とさない)", () => {
    const quiz = quizOf(["term", "order", "contrast", "mystery-new-kind", "cloze"]);
    const sa = load({ cats: SEISAN_CATS, inputCats: [], quiz });
    const rows = sa.categoryStatsRows({ q: {} });
    expect(totalOf(rows)).toBe(quiz.length);
    const m = byKey(rows);
    expect(m["mystery-new-kind"].total).toBe(1);
    expect(m["mystery-new-kind"].label).toBe("mystery-new-kind");
    expect(m.cloze.total).toBe(1);
  });

  test("CATEGORIES が無いときは従来の7つの器に落ちる", () => {
    const quiz = quizOf(["tcode", "shortcut", "term", "scenario", "judgment", "abbr"]);
    const sa = load({ cats: null, inputCats: null, quiz });
    const rows = sa.categoryStatsRows({ q: {} });
    const m = byKey(rows);
    expect(m.tcode_choice.label).toBe("Tコード（選択式）");
    expect(m.term.label).toBe("SAP用語");
    expect(totalOf(rows)).toBe(quiz.length);
  });

  test("記述式の回答が選択式より多くても、正答率が負にならない", () => {
    const quiz = quizOf(["tcode"]);
    const sa = load({ cats: SAP_CATS, inputCats: ["tcode"], quiz });
    // 旧アプリからの取り込みで a と ia が別々に max された形 (ia > a)
    const stats = { q: { "tcode-0": { a: 3, c: 2, ia: 8, ic: 5, ck: 0, ik: 0 } } };
    const m = byKey(sa.categoryStatsRows(stats));
    expect(m.tcode_choice.a).toBe(0);
    expect(m.tcode_choice.c).toBe(0);
    expect(m.tcode_choice.accPct).toBe(null);
    expect(m.tcode_input.accPct).toBe(63);
  });

  test("控えに無い記述式カテゴリでも、選択式と記述式の名前が入れ替わらない", () => {
    const cats = { formula: "数式", term: "用語" };
    const quiz = quizOf(["formula", "term"]);
    const sa = load({ cats, inputCats: ["formula"], quiz });
    const stats = { q: { "formula-0": { a: 5, c: 4, ia: 2, ic: 1, ck: 0, ik: 0 } } };
    const m = byKey(sa.categoryStatsRows(stats));
    expect(m.formula_choice.label).toBe("数式（選択式）");
    expect(m.formula_input.label).toBe("数式（記述式）");
    // 選択式は 回答3 / 正解3、記述式は 回答2 / 正解1。入れ替わっていないこと
    expect(m.formula_choice.a).toBe(3);
    expect(m.formula_input.a).toBe(2);
    expect(m.formula_input.accPct).toBe(50);
  });

  test("習得率と正答率の数は今までと同じ計算で出る", () => {
    const quiz = quizOf(["term", "term", "order"]);
    const sa = load({ cats: SEISAN_CATS, inputCats: [], quiz });
    const stats = { q: { "term-0": { a: 4, c: 3, ck: 2 }, "term-1": { a: 2, c: 0, ck: 0 } } };
    const m = byKey(sa.categoryStatsRows(stats));
    expect(m.term.total).toBe(2);
    expect(m.term.mastered).toBe(1);
    expect(m.term.masteryPct).toBe(50);
    expect(m.term.accPct).toBe(50); // 正解3 / 回答6
    expect(m.order.accPct).toBe(null);
  });
});
