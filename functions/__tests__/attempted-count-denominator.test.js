//
// 挑戦済み問題数の分母の見張り (js/rank.js)。
//
// なぜ要るか: 2026-11-08 に測った。成績画面は choiceAttemptedCount と
// inputAttemptedCount の返り値を、QUIZ_DATA.length と tcodeQuestionCount()
// の横にそのまま並べる (js/screens-stats.js の 選択式挑戦済み問題数 と
// 記述式挑戦済み問題数 の2行)。どちらの関数も頭打ちを持たなかったので、
// 分母を超えた行が出る経路が在った。本物の rank.js で実測した値:
//   選択式 旧詳細5071件 => 5071 / 4951 (102.4%)
//   記述式 旧詳細5071件 => 5071 / 619 (819.2%)
//   記述式 現IDで800件 => 800 / 619 (129.2%)
// 習得数の側は 2026-11-01 に clampToExisting で閉じたが、挑戦済みの側は
// 残っていた (引き継ぎメモの 保留 の (b))。
//
// 超えかたは2通りある。
//   (1) 旧マスタの ID しか無いときの救済 (matched が0なら any を返す) で、
//       any は現存件数と無関係に積まれる
//   (2) 記述式だけの経路。数える側は現存IDかどうかしか見ていないのに、
//       分母は記述式の問題だけなので、種別が記述式から外れた問題の古い ia が
//       残っていると、ID が現存していても超える
//
// 見張る約束は4つ:
//   (1) 分母を超えた挑戦済みは、分母で頭を打つ (選択式・記述式の両方)
//   (2) 記述式は記述式の問題だけを数える
//   (3) 分母の内側の数は1も動かさない
//   (4) 旧詳細しか無い人の件数は0にしない (救済そのものは残す)
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const APP_STATE = fs.readFileSync(path.join(ROOT, "js", "app-state.js"), "utf8");
const RANK = fs.readFileSync(path.join(ROOT, "js", "rank.js"), "utf8");

function subjectOf(id) {
  const src = fs.readFileSync(path.join(ROOT, "subjects", id, "subject.js"), "utf8");
  return vm.runInNewContext(src + NL + "; SUBJECT;", { Object, Array, String, Number });
}

// js/subject-config.js の applySubjectConfig と同じ組み立てを再現する
const APPLY =
  "CATEGORIES = Object.assign({}, SUBJECT.categories || {});" +
  "INPUT_CATEGORIES = new Set(SUBJECT.inputCategories || []);" +
  "RANKS = DEFAULT_RANKS.slice();" +
  "var ks = Object.keys(CATEGORIES);" +
  "QUIZ_DATA = Array.from({ length: TOTAL }, function (_, i) {" +
  " return { id: 'q' + i, category: ks[i % ks.length] }; });";

function load(id, total) {
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set,
    console: { warn: () => {}, error: () => {} },
    QuizStorage: { isChoiceMastered: (s) => (s && (s.k || 0) >= 2) || false },
    RECENT_ACCURACY_WINDOW: 500,
    RECENT_INPUT_ACCURACY_WINDOW: 100,
    escapeHtml: (x) => String(x),
    $: () => null,
    SUBJECT: subjectOf(id),
    TOTAL: total,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(APP_STATE, ctx);
  vm.runInContext(RANK, ctx);
  vm.runInContext("CURRENT_SUBJECT = SUBJECT;" + APPLY, ctx);
  return ctx;
}

const call = (ctx, fn, stats) =>
  vm.runInContext(fn + "(" + JSON.stringify(stats) + ")", ctx);

const denomOf = (ctx) => ({
  choice: vm.runInContext("QUIZ_DATA.length", ctx),
  input: vm.runInContext("tcodeQuestionCount()", ctx),
});

const inputIdsOf = (ctx) =>
  vm.runInContext(
    "QUIZ_DATA.filter(function (q) { return INPUT_CATEGORIES.has(q.category); })" +
      ".map(function (q) { return q.id; })",
    ctx
  );

// 旧マスタの ID (いまのマスタに1つも一致しない) で詳細を積む
function oldDetail(n, kind) {
  const q = {};
  for (let i = 0; i < n; i++) {
    q["OLD-" + i] = kind === "input" ? { a: 3, ia: 3 } : { a: 2, ia: 0 };
  }
  return { q };
}

describe("約束1: 分母を超えた挑戦済みは分母で頭を打つ", () => {
  const ctx = load("sap", 4951);
  const d = denomOf(ctx);
  test.each([5071, 9999, 4952])("選択式 旧詳細%i件", (n) => {
    const v = call(ctx, "choiceAttemptedCount", oldDetail(n, "choice"));
    expect(v).toBe(d.choice);
  });
  test.each([5071, 9999, 620])("記述式 旧詳細%i件", (n) => {
    const v = call(ctx, "inputAttemptedCount", oldDetail(n, "input"));
    expect(v).toBe(d.input);
  });
});

describe("約束2: 記述式は記述式の問題だけを数える", () => {
  const ctx = load("sap", 4951);
  const d = denomOf(ctx);
  test("現存IDで800件に古い ia が在っても、分母を超えない", () => {
    const q = {};
    for (let i = 0; i < 800; i++) q["q" + i] = { a: 3, ia: 3 };
    const v = call(ctx, "inputAttemptedCount", { q });
    expect(v).toBeLessThanOrEqual(d.input);
  });
  test("数えるのは記述式の問題に在る ia だけ", () => {
    const ids = inputIdsOf(ctx);
    const q = {};
    for (let i = 0; i < 5; i++) q[ids[i]] = { a: 3, ia: 3 };
    // 記述式でない現存IDにも ia を積む (種別が変わった古い記録)
    const others = vm.runInContext(
      "QUIZ_DATA.filter(function (q) { return !INPUT_CATEGORIES.has(q.category); })" +
        ".slice(0, 9).map(function (q) { return q.id; })",
      ctx
    );
    others.forEach((id) => {
      q[id] = { a: 3, ia: 3 };
    });
    expect(call(ctx, "inputAttemptedCount", { q })).toBe(5);
  });
});

describe("約束3: 分母の内側の数は1も動かさない", () => {
  const ctx = load("sap", 4951);
  const d = denomOf(ctx);
  const ids = inputIdsOf(ctx);
  test.each([1, 7, 300, 619])("記述式 正常%i件", (n) => {
    const q = {};
    for (let i = 0; i < n; i++) q[ids[i]] = { a: 3, ia: 3 };
    expect(call(ctx, "inputAttemptedCount", { q })).toBe(n);
  });
  test.each([1, 7, 300, 4951])("選択式 正常%i件", (n) => {
    const q = {};
    for (let i = 0; i < n; i++) q["q" + i] = { a: 2, ia: 0 };
    expect(call(ctx, "choiceAttemptedCount", { q })).toBe(n);
  });
  test("選択式で1度も挑戦していない問題は数えない (a と ia が同数)", () => {
    const q = { q0: { a: 3, ia: 3 }, q1: { a: 2, ia: 0 } };
    expect(call(ctx, "choiceAttemptedCount", { q })).toBe(1);
  });
  test("現存IDと旧詳細が混ざったら、現存IDの件数だけを出す", () => {
    const q = {};
    for (let i = 0; i < 100; i++) q["q" + i] = { a: 2, ia: 0 };
    for (let i = 0; i < 50; i++) q["OLD-" + i] = { a: 2, ia: 0 };
    expect(call(ctx, "choiceAttemptedCount", { q })).toBe(100);
    const ids = inputIdsOf(ctx);
    const qi = {};
    for (let i = 0; i < 30; i++) qi[ids[i]] = { a: 3, ia: 3 };
    for (let i = 0; i < 50; i++) qi["OLD-" + i] = { a: 3, ia: 3 };
    expect(call(ctx, "inputAttemptedCount", { q: qi })).toBe(30);
  });
  test("記述式の問題でも ia が0なら記述式挑戦済みに数えない", () => {
    const ids = inputIdsOf(ctx);
    const q = {};
    for (let i = 0; i < 9; i++) q[ids[i]] = { a: 4, ia: 0 };
    expect(call(ctx, "inputAttemptedCount", { q })).toBe(0);
    q[ids[9]] = { a: 4, ia: 1 };
    expect(call(ctx, "inputAttemptedCount", { q })).toBe(1);
  });
  test("挑戦が0件なら0件", () => {
    expect(call(ctx, "choiceAttemptedCount", { q: {} })).toBe(0);
    expect(call(ctx, "inputAttemptedCount", { q: {} })).toBe(0);
    expect(d.choice).toBe(4951);
    expect(d.input).toBe(619);
  });
});

describe("約束4: 旧詳細しか無い人の件数は0にしない", () => {
  const ctx = load("sap", 4951);
  test.each([1, 100, 4000])("選択式 旧詳細%i件はそのまま残る", (n) => {
    expect(call(ctx, "choiceAttemptedCount", oldDetail(n, "choice"))).toBe(n);
  });
  test.each([1, 100, 600])("記述式 旧詳細%i件はそのまま残る", (n) => {
    expect(call(ctx, "inputAttemptedCount", oldDetail(n, "input"))).toBe(n);
  });
});
