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

