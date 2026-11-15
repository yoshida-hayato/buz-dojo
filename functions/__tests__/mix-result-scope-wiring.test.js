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

