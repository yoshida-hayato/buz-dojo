//
// 模試の配線のガード。どれも「在るはずなのに黙って消えても誰も気づかない」形。
//
// 1. 形式の正本 (config/exam-formats.js) が最初に読む並びに入っている。
//    落ちると ExamFormats が居ないまま ExamMode が呼ばれ、面が出ない
// 2. js/exam-mode.js が、クイズの遅延読込の束に入っている
// 3. 模試では1問ごとの正誤と解説を出さない。しかも早い復帰が、解説を
//    書きはじめる行より前に在ること (後ろに在ると前問の解説が一瞬見える)
// 4. 成績の記録と習得の判定は、早い復帰より前に済んでいること。後ろに
//    移ると模試の40問が1問も成績に入らなくなる
// 5. 誤答の枠の数が、画面側で CHOICE_COUNT を直に見ていない。見ていると
//    模試の肢数の指定が効かず、6択のまま本番形式と名乗る
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (...rel) => fs.readFileSync(path.join(ROOT, ...rel), "utf8");

const INDEX = read("index.html");
const APP = read("js", "app.js");
const ENGINE = read("js", "quiz-engine.js");
const BUILDER = read("js", "quiz-builder.js");
const RESULT = read("js", "screens-result.js");
const SETTINGS = read("js", "settings-ui.js");
const CHROME = read("js", "app-chrome.js");
const GUIDE = read("guides", "seisan-kanri-2kyu.html");
const ExamFormats = require(path.join(ROOT, "config", "exam-formats.js"));

function countOf(src, needle) {
  let n = 0;
  let i = src.indexOf(needle);
  while (i >= 0) {
    n += 1;
    i = src.indexOf(needle, i + needle.length);
  }
  return n;
}

test("形式の正本が、最初に読む並びに1度だけ入っている", () => {
  expect(countOf(INDEX, '"config/exam-formats.js"')).toBe(1);
  const pricingAt = INDEX.indexOf('"config/pricing.js"');
  const formatsAt = INDEX.indexOf('"config/exam-formats.js"');
  const loaderAt = INDEX.indexOf('"js/script-loader.js"');
  expect(pricingAt).toBeGreaterThan(-1);
  expect(formatsAt).toBeGreaterThan(pricingAt);
  expect(formatsAt).toBeLessThan(loaderAt);
});

test("模試の画面の受け皿が、index.html に4つとも在る", () => {
  for (const id of [
    'id="exam-card"',
    'id="exam-card-spec"',
    'id="exam-card-note"',
    'id="exam-start-btn"',
    'id="exam-buy-btn"',
    'id="exam-timer"',
    'id="exam-verdict"',
  ]) {
    expect(countOf(INDEX, id)).toBe(1);
  }
});

test("js/exam-mode.js が、クイズの遅延読込の束に入っている", () => {
  expect(countOf(APP, '"js/exam-mode.js"')).toBe(1);
  const engineAt = APP.indexOf('"js/quiz-engine.js"');
  const examAt = APP.indexOf('"js/exam-mode.js"');
  const resultAt = APP.indexOf('"js/screens-result.js"');
  expect(examAt).toBeGreaterThan(engineAt);
  expect(resultAt).toBeGreaterThan(examAt);
});

test("模試では1問ごとの解説を出さない。復帰は解説を書く前に在る", () => {
  const guardAt = ENGINE.indexOf("ExamMode.isExamQuiz()");
  const paintAt = ENGINE.indexOf('$("feedback-result").textContent = isCorrect');
  const expAt = ENGINE.indexOf("buildJudgmentMultiExplanationHtml(q)");
  expect(guardAt).toBeGreaterThan(-1);
  expect(paintAt).toBeGreaterThan(guardAt);
  expect(expAt).toBeGreaterThan(guardAt);
  const body = ENGINE.slice(guardAt, paintAt);
  expect(body.indexOf("nextQuestion()")).toBeGreaterThan(-1);
  expect(body.indexOf("return;")).toBeGreaterThan(-1);
});

test("成績の記録と習得の判定は、模試の復帰より前に済んでいる", () => {
  const guardAt = ENGINE.indexOf("ExamMode.isExamQuiz()");
  const recordAt = ENGINE.indexOf("QuizStorage.record(questionId");
  const answerAt = ENGINE.indexOf("Entitlement.recordAnswer(CURRENT_SUBJECT.id)");
  const masteredAt = ENGINE.indexOf("quiz.sessionNewChoiceMastered.set(");
  expect(recordAt).toBeGreaterThan(-1);
  expect(recordAt).toBeLessThan(guardAt);
  expect(answerAt).toBeLessThan(guardAt);
  expect(masteredAt).toBeLessThan(guardAt);
});

test("模試のときだけ時計を起こし、通常のクイズでは止める", () => {
  expect(ENGINE.indexOf("if (settings.examMode) ExamMode.begin();")).toBeGreaterThan(-1);
  expect(ENGINE.indexOf("else ExamMode.stop();")).toBeGreaterThan(-1);
  expect(countOf(CHROME, "ExamMode.stop()")).toBe(1);
});

test("結果の面と模試の面に、塗り直す呼び出しが在る", () => {
  expect(countOf(RESULT, "ExamMode.paintVerdict()")).toBe(1);
  expect(countOf(SETTINGS, "ExamMode.paintCard()")).toBe(1);
  const msgAt = RESULT.indexOf('$("result-message").textContent');
  const verdictAt = RESULT.indexOf("ExamMode.paintVerdict()");
  expect(verdictAt).toBeGreaterThan(msgAt);
});

// 同じ数字の写しが増えたときの見張り。日程表は3枚あって3枚目が誰にも
// 見られていなかった (10/26 06:48便)。形式の数字も、いま2箇所に在る —
// 模試の表と、着地頁の 2級の出題形式と合格ライン の箇条書きである。
// 字面で突き合わせず、表の値から文を組んで探す。表を直して頁を直さないと落ちる。
test("着地頁の2級の形式が、模試の表と同じ数字を言っている", () => {
  const f = ExamFormats.formatFor("biz-career");
  expect(GUIDE.indexOf("出題形式: " + f.choiceCount + "肢択一")).toBeGreaterThan(-1);
  expect(GUIDE.indexOf("出題数: " + f.questionCount + "問")).toBeGreaterThan(-1);
  expect(GUIDE.indexOf("試験時間: " + f.minutes + "分")).toBeGreaterThan(-1);
  expect(
    GUIDE.indexOf("出題数の概ね" + f.passPercent + "パーセント以上の正答")
  ).toBeGreaterThan(-1);
});

test("誤答の枠の数は、画面側で CHOICE_COUNT を直に見ていない", () => {
  expect(countOf(BUILDER, "CHOICE_COUNT - 1")).toBe(0);
  expect(countOf(BUILDER, "slots - 1")).toBe(3);
  expect(BUILDER.indexOf("settings && settings.choiceCount")).toBeGreaterThan(-1);
});
