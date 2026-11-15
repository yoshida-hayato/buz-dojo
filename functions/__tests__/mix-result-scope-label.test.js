//
// 結果画面の習得ゲージが、数えている範囲を言うことの見張り。
//
// なぜ要るか (2026-11-15 12:48便 に本物の Chromium で実測)。ミックス出題の
// 答えは科目ごとの控えへ分かれて残るようになった (recordForSubject) が、
// このゲージは開いている科目の成績と QUIZ_DATA の問題数しか見ない。
// 3科目を混ぜて10問に答えたとき、控えには3科目ぶん10問が入っているのに、
// ゲージは 0 から 0 / 100問 のままだった (100 は開いている科目の問題数)。
// 画面だけ見ると「何も増えなかった」と読める。数を足し合わせるのは
// 別便の仕事なので、いまは範囲を言う。
//
// ゲージの本体の行はテンプレート文字列 (囲み文字) を含むのでパッチの口を
// 通らない。だから見出しを塗る関数を末尾に足し、呼び出しを関数の頭に
// 1行入れる形にした。ここはその2つを見る。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const SRC = fs.readFileSync(path.join(ROOT, "js", "screens-result.js"), "utf8");

// 関数1つだけを本物から切り出して走らせる。本体は大域を要るので全体は読めない。
function load(subject, quizObj) {
  const head = "function paintMasteredScopeLabel() {";
  const at = SRC.indexOf(head);
  if (at < 0) throw new Error("paintMasteredScopeLabel が見つからない");
  const end = SRC.indexOf(NL + "}", at);
  const body = SRC.slice(at, end + 2);
  const el = { textContent: "" };
  const ctx = {
    String, Object,
    document: { getElementById: (id) => (id === "mastered-label" ? el : null) },
    CURRENT_SUBJECT: subject,
    quiz: quizObj,
  };
  vm.createContext(ctx);
  vm.runInContext(body + NL + ";globalThis.__F = paintMasteredScopeLabel;", ctx);
  ctx.__F();
  return el.textContent;
}

const BASE = "選択式習得（2回連続正解）";

test("ふつうの出題では、見出しを1文字も変えない", () => {
  const out = load({ id: "ap-kamoku-b", shortTitle: "応用情報B" }, { mixed: false });
  expect(out).toBe(BASE);
});

// 3波の1波目。ゲージが混ぜた科目ぶんを足し合わせるようになるので、
// 範囲の言い方が変わる。前と後のどちらでも真になる形に緩めておく。
// 2波目で文面を直し、3波目でこの2件を新しい文面で締め直す。
test("ミックス出題では、範囲を言い足す", () => {
  const out = load({ id: "ap-kamoku-b", shortTitle: "応用情報B" }, { mixed: true });
  expect(out.indexOf(BASE)).toBe(0);
  expect(out.length).toBeGreaterThan(BASE.length);
  expect(out.indexOf("ぶん")).toBeGreaterThan(-1);
});

test("科目の題が無くても、範囲は言う", () => {
  const out = load(null, { mixed: true });
  expect(out.indexOf(BASE)).toBe(0);
  expect(out.indexOf("ぶん")).toBeGreaterThan(-1);
});

test("mixed が真でなければ、どの形でも元の見出しに戻す", () => {
  const sub = { id: "sap", shortTitle: "SAP" };
  expect(load(sub, null)).toBe(BASE);
  expect(load(sub, {})).toBe(BASE);
  expect(load(sub, { mixed: "yes" })).toBe(BASE);
  expect(load(sub, { mixed: 1 })).toBe(BASE);
});

test("ゲージの頭で呼んでいる", () => {
  const head = SRC.indexOf("function animateMasteredGauge(");
  expect(head).toBeGreaterThan(-1);
  const at = SRC.indexOf("paintMasteredScopeLabel()", head);
  expect(at).toBeGreaterThan(head);
  expect(at - head).toBeLessThan(80);
  // 宣言と呼び出しで2つ。3つ目が出たら、どちらかが要らない写しである
  expect(SRC.split("paintMasteredScopeLabel()").length - 1).toBe(2);
});

test("見出しに id が在る", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  expect(html.split('id="mastered-label"').length - 1).toBe(1);
});
