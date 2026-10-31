//
// 成績画面が、鍵を持たない問題で undefined と書かないことのガード。
//
// なぜ要るか: js/stats-analysis.js は entry.module / entry.code / entry.name を
// 素で読んでいた。esc() は String() を通すだけなので、鍵が無いと画面に
// undefined と出る。repo の他5ファイル (screens-result.js / screens-lesson.js /
// quiz-builder.js / screens-contact.js / tcode-browser.js) は全部 || で
// 守っており、ここだけ守っていなかった。
// 並べ替え・対比・シナリオ・穴埋めは code を持たない形式で、
// quiz-builder.js が e.name || e.code || 手順の並べ替え と逃げているのが
// その証拠である。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "stats-analysis.js"), "utf8");
const NL = String.fromCharCode(10);

function fakeEl() {
  return {
    innerHTML: "",
    className: "",
    children: [],
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null,
  };
}

function load(quiz) {
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set,
    console: { warn: () => {}, error: () => {} },
    document: { createElement: () => fakeEl() },
    CATEGORIES: { order: "並べ替え", contrast: "対比" },
    INPUT_CATEGORIES: new Set(),
    QUIZ_DATA: quiz,
    QuizStorage: { isChoiceMastered: (s) => (s && (s.ck || 0) >= 2) || false },
  };
  return vm.runInContext(SRC + NL + "; StatsAnalysis;", vm.createContext(sandbox));
}

// 器と中の子の innerHTML を全部つないだ字面
function allHtml(container) {
  return (
    container.innerHTML +
    container.children.map((c) => c.innerHTML + c.children.map((g) => g.innerHTML).join("")).join("")
  );
}

// code も name も持たない並べ替えの問題。module も無い
const NO_KEYS = [
  { id: "ord-1", category: "order", priority: 1, choices: ["正", "誤"], explanation: "解説" },
  { id: "con-1", category: "contrast", priority: 2, choices: ["正", "誤"], explanation: "解説", question: "どちらが先か" },
];

const STATS = {
  q: { "ord-1": { a: 6, c: 1, ck: 0 }, "con-1": { a: 5, c: 2, ck: 0 } },
};

describe("鍵を持たない問題でも undefined と書かない", () => {
  test("モジュール別: module が無い問題は 未分類 の行になる", () => {
    const sa = load(NO_KEYS);
    const rows = sa.moduleStatsRows(STATS);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("未分類");
    expect(rows[0].total).toBe(2);
    const container = fakeEl();
    sa.renderModuleAccuracy(container, STATS, 70);
    const html = allHtml(container);
    expect(html.indexOf("未分類")).toBeGreaterThan(-1);
    expect(html.indexOf("undefined")).toBe(-1);
  });

  test("優先復習: code も name も無い問題で undefined を描かない", () => {
    const sa = load(NO_KEYS);
    const container = fakeEl();
    sa.renderReviewTop(container, sa.getReviewPriorities(STATS));
    const html = allHtml(container);
    expect(html.indexOf("undefined")).toBe(-1);
    // name が無ければ question に逃げる
    expect(html.indexOf("どちらが先か")).toBeGreaterThan(-1);
  });

  test("code と name が在るときは今までどおり出る", () => {
    const withKeys = [
      { id: "t-1", category: "order", module: "品質管理", code: "Q1", name: "手順を並べる", priority: 1, choices: ["正"], explanation: "x" },
    ];
    const sa = load(withKeys);
    const container = fakeEl();
    const stats = { q: { "t-1": { a: 4, c: 1, ck: 0 } } };
    sa.renderReviewTop(container, sa.getReviewPriorities(stats));
    const html = allHtml(container);
    expect(html.indexOf("Q1")).toBeGreaterThan(-1);
    expect(html.indexOf("手順を並べる")).toBeGreaterThan(-1);
    expect(html.indexOf("品質管理")).toBeGreaterThan(-1);
    expect(html.indexOf("undefined")).toBe(-1);
  });
});
