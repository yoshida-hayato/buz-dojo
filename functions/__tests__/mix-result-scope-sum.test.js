// 結果画面の習得ゲージが、混ぜた科目ぶんで数えることの見張り。
//
// なぜ要るか (2026-11-15 18:48便 に本物の Chromium で実測)。ゲージは
// 開いている科目の成績と QUIZ_DATA の問題数しか見ていなかった。3科目246問を
// 混ぜ、7問が新しく習得に届いた回で、今回新しく習得の札は7枚出るのに
// ゲージは 0 から 3 / 100問 と出た。同じ画面の2箇所が違う数を言う形である。
// 既に習得が在る人で測ると、7 から 7 / 100問 と出た (正しくは
// 7 + 30 + 12 = 49 を 246 で割って 49 / 246問)。
//
// 直したあとに測り直すと、3回とも ゲージの増分と札の枚数が一致し、
// 分母は 246 になった。
//
// この枚は数え方そのものを見る。範囲を作る側 (mixedScopeFrom) と、
// 足し合わせる側 (masteredScopeNumbers と masteredScopeTotal) の両方を、
// 本物の js から切り出して走らせる。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const SU = fs.readFileSync(path.join(ROOT, "js", "settings-ui.js"), "utf8");
const RANK = fs.readFileSync(path.join(ROOT, "js", "rank.js"), "utf8");

function cut(src, head) {
  const at = src.indexOf(head);
  if (at < 0) throw new Error(head + " が見つからない");
  const end = src.indexOf(NL + "}", at);
  return src.slice(at, end + 2);
}

// 範囲を作る側
function loadScopeFrom() {
  const ctx = { Array, Object, Number, String };
  vm.createContext(ctx);
  vm.runInContext(
    cut(SU, "function mixedScopeFrom(sources) {") + NL + ";globalThis.__F = mixedScopeFrom;",
    ctx
  );
  return ctx.__F;
}

// 足し合わせる側。masteredCount と QUIZ_DATA と QuizStorage は偽で渡す。
function loadNumbers(quizObj, mastered, quizDataLen) {
  const src =
    cut(RANK, "function masteredScopeRows() {") + NL +
    cut(RANK, "function masteredScopeTotal() {") + NL +
    cut(RANK, "function masteredCountInScopeRow(row) {") + NL +
    cut(RANK, "function masteredScopeNumbers(statsBefore, statsAfter) {");
  const ctx = {
    Array, Object, Number, String, Set,
    quiz: quizObj,
    QUIZ_DATA: new Array(quizDataLen).fill({ id: "x" }),
    masteredCount: (s) => Number(s && s.n) || 0,
    QuizStorage: {
      selectionSetsFor: (id) => ({ choiceMastered: new Set(mastered[id] || []) }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(
    src + NL + ";globalThis.__N = masteredScopeNumbers;globalThis.__T = masteredScopeTotal;",
    ctx
  );
  return { numbers: ctx.__N, denom: ctx.__T };
}

test("範囲は、読めた科目ごとに 問題数と id と 答える前の習得数 を持つ", () => {
  const f = loadScopeFrom();
  const out = f([
    { subjectId: "a", entries: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
      choiceMastered: new Set(["a1"]) },
    { subjectId: "b", entries: [{ id: "b1" }, { id: "b2" }], choiceMastered: new Set() },
  ]);
  expect(out.length).toBe(2);
  expect(out[0].total).toBe(3);
  expect(out[0].ids.join(",")).toBe("a1,a2,a3");
  expect(out[0].masteredBefore).toBe(1);
  expect(out[1].total).toBe(2);
  expect(out[1].masteredBefore).toBe(0);
});

test("答える前の習得数は、その科目の現存問題だけで数える", () => {
  const f = loadScopeFrom();
  // 消された問題 (a9) の古い成績は、分子にも分母にも入れない
  const out = f([
    { subjectId: "a", entries: [{ id: "a1" }, { id: "a2" }],
      choiceMastered: new Set(["a1", "a9"]) },
  ]);
  expect(out[0].total).toBe(2);
  expect(out[0].masteredBefore).toBe(1);
});

test("同じ id が2度在っても、問題数は1つで数える", () => {
  const f = loadScopeFrom();
  const out = f([
    { subjectId: "a", entries: [{ id: "a1" }, { id: "a1" }, { id: "a2" }],
      choiceMastered: new Set(["a1"]) },
  ]);
  expect(out[0].total).toBe(2);
  expect(out[0].masteredBefore).toBe(1);
});

test("科目 id が無い行と、空の一覧は落とす", () => {
  const f = loadScopeFrom();
  expect(f([{ entries: [{ id: "x" }] }, null, { subjectId: "" }]).length).toBe(0);
  expect(f(null).length).toBe(0);
  expect(f([]).length).toBe(0);
});

test("ミックスでは、分母が混ぜた科目の問題数の合計になる", () => {
  const scope = [
    { subjectId: "a", total: 100, ids: ["a1", "a2"], masteredBefore: 7 },
    { subjectId: "b", total: 100, ids: ["b1"], masteredBefore: 30 },
    { subjectId: "c", total: 46, ids: ["c1"], masteredBefore: 12 },
  ];
  const L = loadNumbers({ mixed: true, mixedScope: scope },
    { a: ["a1", "a2"], b: ["b1"], c: ["c1"] }, 100);
  expect(L.denom()).toBe(246);
  const n = L.numbers({ n: 7 }, { n: 7 });
  expect(n.total).toBe(246);
  expect(n.before).toBe(49);
  expect(n.after).toBe(4);
});

test("後の数は、いまの控えから科目ごとに数え直す", () => {
  const scope = [
    { subjectId: "a", total: 10, ids: ["a1", "a2", "a3"], masteredBefore: 1 },
    { subjectId: "b", total: 10, ids: ["b1", "b2"], masteredBefore: 0 },
  ];
  const L = loadNumbers({ mixed: true, mixedScope: scope },
    { a: ["a1", "a2"], b: ["b2"] }, 10);
  const n = L.numbers({ n: 1 }, { n: 1 });
  expect(n.before).toBe(1);
  expect(n.after).toBe(3);
  expect(n.total).toBe(20);
});

test("範囲に無い id が控えで習得済みでも、後の数には入れない", () => {
  const scope = [{ subjectId: "a", total: 2, ids: ["a1", "a2"], masteredBefore: 0 }];
  const L = loadNumbers({ mixed: true, mixedScope: scope }, { a: ["a1", "a9", "a8"] }, 2);
  expect(L.numbers({ n: 0 }, { n: 0 }).after).toBe(1);
});

test("ふつうの出題では、開いている科目だけを数える", () => {
  const L = loadNumbers({ mixed: false, mixedScope: null }, {}, 100);
  expect(L.denom()).toBe(100);
  const n = L.numbers({ n: 9 }, { n: 12 });
  expect(n.before).toBe(9);
  expect(n.after).toBe(12);
  expect(n.total).toBe(100);
});

test("mixed が真でなければ、範囲が在っても使わない", () => {
  const scope = [{ subjectId: "a", total: 999, ids: ["a1"], masteredBefore: 5 }];
  for (const q of [{ mixed: false, mixedScope: scope }, { mixed: 1, mixedScope: scope },
                   { mixedScope: scope }, {}, null]) {
    const L = loadNumbers(q, { a: ["a1"] }, 100);
    expect(L.denom()).toBe(100);
    expect(L.numbers({ n: 3 }, { n: 4 }).after).toBe(4);
  }
});

test("ミックスだが範囲が空なら、開いている科目だけを数える", () => {
  for (const scope of [[], null, undefined, "x"]) {
    const L = loadNumbers({ mixed: true, mixedScope: scope }, {}, 77);
    expect(L.denom()).toBe(77);
    expect(L.numbers({ n: 2 }, { n: 5 }).after).toBe(5);
  }
});
