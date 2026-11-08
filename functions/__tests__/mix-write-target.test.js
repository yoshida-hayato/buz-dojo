// 回答の書き先を「その問題の科目」で決める土台の見張り (ミックス出題 第1段)。
//
// なぜ要るか (2026-11-09 00:48便 に実測)。社長の依頼は全科目ミックス出題で、
// 設計は docs/MIX_MODE_DESIGN.md に在る。いちばん大きい塞ぎは、
// QuizStorage が「いま開いている科目」を1つしか持たないことで、
// 画面だけ作ると12科目ぶんの成績が1科目に流れ込む。repo に
// _scrubPollutedStats と _looksLikeSapPollution が残っているのは、
// 同じ事故が過去に起きたからである。
//
// だから第1段は、書き先を1箇所で決める形にした。
//   (1) 出題プールを作る側が知っている科目 id を、問題自身に添える
//   (2) quiz-engine は answerSubjectId(q) だけで宛先を決める
//   (3) QuizStorage.record は宛先が開いている科目と違えば積まずに捨てる
// 接頭からの当て推量 (guessSubjectId) は使わない。接頭の表に当たらない id は
// 既定の科目 (sap) へ行くので、接頭が1つ食い違うだけで黙って混ざる。
//
// 同じ便で、この近所に死んだ検査が2件在ることも実測した。
// exam-mode-wiring の answerAt と masteredAt は indexOf の結果を
// toBeLessThan でしか見ておらず、-1 は何より小さいので、
// 日次枠の記録 (Entitlement.recordAnswer) を丸ごと消しても9件とも通った。
// それは同じ便で直してある。この見張りは、その直した側が緩まないことも見る。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const ENGINE = fs.readFileSync(path.join(ROOT, "js", "quiz-engine.js"), "utf8");
const STORAGE = fs.readFileSync(path.join(ROOT, "js", "storage.js"), "utf8");
const EXAM_GUARD = fs.readFileSync(
  path.join(ROOT, "functions", "__tests__", "exam-mode-wiring.test.js"),
  "utf8"
);

function countOf(src, needle) {
  return src.split(needle).length - 1;
}

// 宛先を決める関数だけを本物の quiz-engine から切り出して走らせる。
// 本体は DOM を要るので、ここは関数1つだけを見る。
function loadAnswerSubjectId(currentSubject) {
  const head = "function answerSubjectId(q) {";
  const at = ENGINE.indexOf(head);
  if (at < 0) throw new Error("answerSubjectId が見つからない");
  const end = ENGINE.indexOf(NL + "}", at);
  const src = ENGINE.slice(at, end + 2);
  const ctx = { String, CURRENT_SUBJECT: currentSubject };
  vm.createContext(ctx);
  vm.runInContext(src + NL + ";globalThis.__F = answerSubjectId;", ctx);
  return ctx.__F;
}

function makeStorage(openSubjectId) {
  const ctx = { console: { warn() {}, error() {} }, JSON, Object, Array, Number, String, Math, Set };
  vm.createContext(ctx);
  vm.runInContext(STORAGE + NL + ";globalThis.__S = QuizStorage;", ctx);
  const S = ctx.__S;
  S.subjectId = openSubjectId;
  S.stats = { answered: 0, correct: 0, q: {} };
  // 控えの保存と段位の塗り直しはこの試験の対象ではないので黙らせる
  S._persist = function () {};
  S._syncRankSnapshot = function () {};
  S._touchLocalSummaryCache = function () {};
  S._bumpDaily = function () {};
  S._bumpMasteredCounts = function () {};
  return S;
}

test("宛先は問題が持つ科目で決まり、無ければ開いている科目になる", () => {
  const f = loadAnswerSubjectId({ id: "fe-kamoku-b" });
  expect(f({ subjectId: "ap-kamoku-b" })).toBe("ap-kamoku-b");
  expect(f({})).toBe("fe-kamoku-b");
  expect(f(null)).toBe("fe-kamoku-b");
});

test("開いている科目が無いときも落ちない", () => {
  const f = loadAnswerSubjectId(null);
  expect(f(null)).toBe("");
  expect(f({ subjectId: "sap" })).toBe("sap");
});

test("宛先が接頭からの当て推量ではない", () => {
  // guessSubjectId は接頭の表に当たらない id を既定の科目へ流す。
  // quiz-engine の書き込みの経路でこれを使ってはいけない。
  expect(countOf(ENGINE, "guessSubjectId")).toBe(0);
  expect(countOf(ENGINE, "function answerSubjectId(")).toBe(1);
});

test("書き込みの3箇所が宛先を受け取っている", () => {
  expect(countOf(ENGINE, "QuizStorage.record(questionId, isCorrect, !!q.inputMode, answerSubject)")).toBe(1);
  expect(countOf(ENGINE, "Entitlement.recordAnswer(answerSubject)")).toBe(1);
  expect(countOf(ENGINE, "Entitlement.recordAnswer(CURRENT_SUBJECT.id)")).toBe(0);
  expect(countOf(ENGINE, "showQuestionGlobalRate(questionId, isCorrect, !!q.inputMode, answerSubjectId(q))")).toBe(1);
});

test("章の進みは、宛先が開いている科目と同じときだけ積む", () => {
  // ChapterProgress.recordCorrect は科目の実体を要るので、ミックス中に
  // 他科目の正解で呼ぶと、開いている科目の章が進んでしまう。
  const at = ENGINE.indexOf("ChapterProgress.recordCorrect(");
  expect(at).toBeGreaterThan(-1);
  const head = ENGINE.lastIndexOf("if (", at);
  const cond = ENGINE.slice(head, at);
  expect(cond.indexOf("answerSubject === CURRENT_SUBJECT.id")).toBeGreaterThan(-1);
});

test("問題を組むときに科目 id を添えている", () => {
  expect(countOf(ENGINE, "built.subjectId = slot.subjectId || answerSubjectId(null)")).toBe(1);
});

test("宛先が開いている科目と同じなら、これまでどおり積む", () => {
  const S = makeStorage("fe-kamoku-b");
  S.record("q1", true, false, "fe-kamoku-b");
  expect(S.stats.answered).toBe(1);
  expect(S.stats.correct).toBe(1);
  expect(S.stats.q.q1.a).toBe(1);
});

test("宛先を省いた呼び方は、これまでどおり積む", () => {
  const S = makeStorage("fe-kamoku-b");
  S.record("q1", false, false);
  expect(S.stats.answered).toBe(1);
  expect(S.stats.q.q1.a).toBe(1);
});

test("宛先が開いている科目と違えば、1件も積まない", () => {
  const S = makeStorage("fe-kamoku-b");
  const out = S.record("apb-sec-001", true, false, "ap-kamoku-b");
  expect(S.stats.answered).toBe(0);
  expect(S.stats.correct).toBe(0);
  expect(Object.keys(S.stats.q).length).toBe(0);
  expect(out).toBe(S.stats);
});

test("違う宛先を捨てたことは、黙らずに残る", () => {
  const said = [];
  const ctx = { console: { warn: (m) => said.push(String(m)), error() {} }, JSON, Object, Array, Number, String, Math, Set };
  vm.createContext(ctx);
  vm.runInContext(STORAGE + NL + ";globalThis.__S = QuizStorage;", ctx);
  const S = ctx.__S;
  S.subjectId = "fe-kamoku-b";
  S.stats = { answered: 0, correct: 0, q: {} };
  S._persist = function () {};
  S.record("apb-sec-001", true, false, "ap-kamoku-b");
  expect(said.length).toBe(1);
  expect(said[0].indexOf("書き先")).toBeGreaterThan(-1);
});

test("模試の見張りの、順番を見る3件が死んでいない", () => {
  // indexOf の結果を toBeLessThan だけで見ると、-1 は何より小さいので
  // その行が消えても通る。下から押さえる1行が在ることを見る。
  const at = EXAM_GUARD.indexOf("test(" + String.fromCharCode(34) + "成績の記録と習得の判定は");
  expect(at).toBeGreaterThan(-1);
  const body = EXAM_GUARD.slice(at, EXAM_GUARD.indexOf(NL + "});", at));
  for (const v of ["recordAt", "answerAt", "masteredAt"]) {
    expect(body.indexOf("expect(" + v + ").toBeGreaterThan(-1)")).toBeGreaterThan(-1);
  }
});
