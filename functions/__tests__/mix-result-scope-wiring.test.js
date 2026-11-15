// 習得ゲージが混ぜた範囲を数えるまでの、繋ぎ4箇所の見張り。
//
// なぜ要るか (2026-11-15 18:48便 に実測)。数え方そのものは
// mix-result-scope-sum が本物の関数を走らせて見ている。だが数え方が
// 正しくても、範囲が画面まで届かなければゲージは開いている科目の数を出す。
// 繋ぎを1つずつ外して全1,316件を走らせたら、6通りが素通りした。
// 繋ぎが欠けても素材の見張りが全通する形で、12:48便 が踏んだのと同じ型
// (quiz-engine が許可を渡していることだけを見て、受け取る側が無いのに
// 全通した) である。
//
// 繋ぎは4つ。
//   (1) 読めた科目から範囲を作る (settings-ui)
//   (2) MixScreen がそれを startQuiz へ渡す (mix-screen)
//   (3) quiz-engine が quiz に持たせる (quiz-engine)
//   (4) 結果画面のゲージと分母が範囲の数を使う (screens-result と rank)
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const SU = fs.readFileSync(path.join(ROOT, "js", "settings-ui.js"), "utf8");
const MS = fs.readFileSync(path.join(ROOT, "js", "mix-screen.js"), "utf8");
const QE = fs.readFileSync(path.join(ROOT, "js", "quiz-engine.js"), "utf8");
const SR = fs.readFileSync(path.join(ROOT, "js", "screens-result.js"), "utf8");
const RANK = fs.readFileSync(path.join(ROOT, "js", "rank.js"), "utf8");

function countOf(src, needle) {
  return src.split(needle).length - 1;
}

test("1 範囲を作る関数が1つだけ在る", () => {
  expect(countOf(SU, "function mixedScopeFrom(sources) {")).toBe(1);
});

test("2 MixScreen が、読めた科目から作った範囲を渡している", () => {
  // 定数や null を渡す形に戻っていないことまで見る。読めなかった科目は
  // 問題数が分からないので、渡すのは res.sources でなければならない。
  expect(countOf(MS, "mixedScope: mixedScopeFrom(res.sources),")).toBe(1);
  expect(countOf(MS, "mixedScope: null")).toBe(0);
  const at = MS.indexOf("startQuiz(want, {");
  expect(at).toBeGreaterThan(-1);
  const tail = MS.slice(at, at + 200);
  expect(tail.indexOf("mixedSlots: slots")).toBeGreaterThan(-1);
  expect(tail.indexOf("mixedScope: mixedScopeFrom(res.sources)")).toBeGreaterThan(-1);
});

test("3 quiz-engine が、渡された範囲を quiz に持たせている", () => {
  const live = "mixedScope: Array.isArray(options.mixedScope) ? options.mixedScope : null,";
  expect(countOf(QE, live)).toBe(1);
  // 範囲を捨てる形 (定数) が残っていないこと
  expect(countOf(QE, "mixedScope: null,")).toBe(0);
  expect(countOf(QE, "mixedScope: [],")).toBe(0);
  // mixed の隣に在ること。同じ出題の形から出る2つなので離さない
  const a = QE.indexOf("mixed: !!mixedSlots,");
  const b = QE.indexOf(live);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  expect(b - a).toBeLessThan(400);
});

test("4 ゲージの3つの数が、範囲の数え方から来ている", () => {
  expect(countOf(SR, "const nums = masteredScopeNumbers(statsBefore, statsAfter);")).toBe(1);
  expect(countOf(SR, "const before = nums.before;")).toBe(1);
  expect(countOf(SR, "const after = nums.after;")).toBe(1);
  expect(countOf(SR, "const total = nums.total;")).toBe(1);
  // 開いている科目に固定した数え方が、ゲージの中に残っていないこと
  const at = SR.indexOf("function animateMasteredGauge(");
  expect(at).toBeGreaterThan(-1);
  const end = SR.indexOf("function animateInputMasteredGauge(");
  expect(end).toBeGreaterThan(at);
  const body = SR.slice(at, end);
  expect(body.indexOf("masteredCount(")).toBe(-1);
  expect(body.indexOf("QUIZ_DATA.length")).toBe(-1);
});

test("5 ゲージの分母が、範囲の問題数から来ている", () => {
  expect(countOf(RANK, "const total = masteredScopeTotal();")).toBe(1);
  expect(countOf(RANK, "return masteredScopePct(count);")).toBe(1);
  // masteredPct の中に開いている科目の問題数が残っていないこと。
  // 呼び元はゲージの4箇所だけなので、ここを戻すとゲージの百分率だけが
  // 分母違いになり、数と割合が食い違う画面になる。
  const at = RANK.indexOf("function masteredPct(count) {");
  expect(at).toBeGreaterThan(-1);
  const end = RANK.indexOf("function inputMasteredPct(", at);
  expect(end).toBeGreaterThan(at);
  const body = RANK.slice(at, end);
  expect(body.indexOf("QUIZ_DATA.length")).toBe(-1);
  expect(body.indexOf("masteredScopePct(count)")).toBeGreaterThan(-1);
  // 割り算の本体が、範囲の分母を使っていること
  const pat = RANK.indexOf("function masteredScopePct(count) {");
  expect(pat).toBeGreaterThan(-1);
  const pbody = RANK.slice(pat, pat + 300);
  expect(pbody.indexOf("masteredScopeTotal()")).toBeGreaterThan(-1);
  expect(pbody.indexOf("QUIZ_DATA.length")).toBe(-1);
});

test("6 範囲の数え方の4つが、どれも1つだけ在る", () => {
  for (const name of [
    "function masteredScopeRows() {",
    "function masteredScopeTotal() {",
    "function masteredCountInScopeRow(row) {",
    "function masteredScopeNumbers(statsBefore, statsAfter) {",
  ]) {
    expect(countOf(RANK, name)).toBe(1);
  }
});

test("7 見出しが、範囲の本数から文面を組んでいる", () => {
  expect(countOf(SR, "const rows = quiz.mixedScope;")).toBe(1);
  const at = SR.indexOf("function paintMasteredScopeLabel() {");
  expect(at).toBeGreaterThan(-1);
  const body = SR.slice(at, at + 900);
  expect(body.indexOf("Array.isArray(rows) ? rows.length : 0")).toBeGreaterThan(-1);
  expect(body.indexOf("n > 0 ?")).toBeGreaterThan(-1);
});
