// 後から読む側のモジュールが読めなかったときに、クイズが止まらないこと。
//
// 背景 (2026-11-07 18:48便)。js/question-reports.js は
// ensureQuestionReports で後から読む。startQuizAsync はその失敗を
// console.warn だけで飲み込んで先へ進むので、QuestionReports が
// 未定義のまま回答の処理 (finishAnswer) へ来る筋が在る。
// そこで素に QuestionReports.isAvailable() を呼んでいたため、
// ReferenceError が投げて finishAnswer の残りが走らなかった。
// Chromium で実測した (幅390、Math.random を固定して同じ問題で比べた):
//   直す前 / 読める : 解説カード 358x496、次の問題へ 139x47、頁エラー0
//   直す前 / 落ちる : 解説カード 0x0 (hidden)、次の問題へ 0x0、
//                     頁エラー QuestionReports is not defined
//   直した後 / 読める: 358x496 と 139x47 (直す前と1pxも違わない)
//   直した後 / 落ちる: 358x496 と 139x47 (読めたときと同じ)
// つまり利用者は1問目に答えた時点で、正誤も解説も次へのボタンも
// 出ない画面に取り残され、再読み込みしか道が無かった。
//
// 同じ形 (読込の失敗を飲み込んで、同じ関数の先で後から読む側の大域を
// 使う) を repo 全体で数えたら5箇所だった。js/quiz-engine.js のここ、
// js/screens-subjects.js の3箇所、js/screens-stats.js である。
// screens-subjects の3箇所は typeof の門を持ち、screens-stats は
// 失敗したら先へ進まずに戻る。抜けていたのはここだけである。
// 残りの経路 (js/app-chrome.js の4箇所、js/billing-ui.js) は then の
// 中で使う形なので、読込が失敗すると then 自体が走らない。
//
// 管理画面の側も一緒に見る。問題指摘が届いても、問題文が1行に潰れて
// いては社長が読めない。
const fs = require("fs");
const path = require("path");

const NL = String.fromCharCode(10);
const ROOT = path.join(__dirname, "..", "..");
const ENGINE = fs.readFileSync(path.join(ROOT, "js", "quiz-engine.js"), "utf8");
const ADMIN_CSS = fs.readFileSync(path.join(ROOT, "css", "admin.css"), "utf8");

const FN_NAME = "questionReportPanelAvailable";
const FN_HEAD = "function " + FN_NAME + "() {";

// 本物の字面から関数を切り出す。註ではなく、効いている式を走らせる。
function cutFunction() {
  const start = ENGINE.indexOf(FN_HEAD);
  if (start < 0) return null;
  const close = ENGINE.indexOf(NL + "}" + NL, start);
  if (close < 0) return null;
  return ENGINE.slice(start, close + 3);
}

// 切り出した関数を、QuestionReports を引数として渡す器で走らせる。
// 引数に undefined を渡せば、関数の中の typeof は undefined を見る。
function run(stub) {
  const body = cutFunction();
  const f = new Function("QuestionReports", body + NL + "return " + FN_NAME + "();");
  return f(stub);
}

describe("後から読むモジュールが欠けても、クイズが止まらない", () => {
  test("判断を寄せた関数が js/quiz-engine.js に在る", () => {
    expect(cutFunction() !== null).toBe(true);
  });

  test("QuestionReports が未定義でも、投げずに false を返す", () => {
    let threw = "";
    let got = null;
    try {
      got = run(undefined);
    } catch (e) {
      threw = String(e && e.message);
    }
    expect(threw).toBe("");
    expect(got).toBe(false);
  });

  test("isAvailable が真なら真、偽なら偽を返す", () => {
    expect(run({ isAvailable: () => true })).toBe(true);
    expect(run({ isAvailable: () => false })).toBe(false);
  });

  test("返すのは必ず真偽値である", () => {
    expect(run({ isAvailable: () => 1 })).toBe(true);
    expect(run({ isAvailable: () => "" })).toBe(false);
  });

  // ここが肝である。素の使用が1つでも戻ったら落ちる。
  test("js/quiz-engine.js で QuestionReports を素で触る行は、寄せた関数の中の1行だけ", () => {
    const lines = ENGINE.split(NL);
    const uses = [];
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed.indexOf("//") === 0) continue;
      if (lines[i].indexOf("QuestionReports.") >= 0) uses.push(i + 1);
    }
    expect(uses.length).toBe(1);
    const headLine = ENGINE.slice(0, ENGINE.indexOf(FN_HEAD)).split(NL).length;
    const tailLine = headLine + cutFunction().split(NL).length;
    expect(uses[0] > headLine).toBe(true);
    expect(uses[0] < tailLine).toBe(true);
  });

  test("回答後に面を出し分ける所が、寄せた関数を呼んでいる", () => {
    const want =
      'if (' + FN_NAME + '()) {' + NL +
      '    $("question-report").classList.remove("hidden");';
    expect(ENGINE.indexOf(want) >= 0).toBe(true);
  });

  // 前提そのものを見張る。飲み込みが無くなったらこの件は要らなくなるが、
  // 黙って要らなくなるのではなく、ここが落ちて気づく形にする。
  test("startQuizAsync は、後から読むモジュールの失敗を飲み込んで先へ進む", () => {
    const at = ENGINE.indexOf("ensureQuestionReports()");
    expect(at > 0).toBe(true);
    const from = at > 200 ? at - 200 : 0;
    const before = ENGINE.slice(from, at);
    const after = ENGINE.slice(at, at + 200);
    expect(before.indexOf("try {") >= 0).toBe(true);
    expect(after.indexOf("catch") >= 0).toBe(true);
  });

  // QuestionStats は同じ飲み込みの下に6つの使用が在るが、2つの typeof の
  // 門の中に入っている (renderQuestion と showQuestionGlobalRate)。
  // paintQuestionGlobalRate の使用は、後者の門を通ってしか呼ばれない。
  test("QuestionStats の側の門が2つとも残っている", () => {
    const lines = ENGINE.split(NL);
    let guards = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].indexOf("typeof QuestionStats") >= 0) guards += 1;
    }
    expect(guards).toBe(2);
  });
});

// 管理画面の側。問題文は改行を保って出すこと。
function cssBlock(name) {
  const at = ADMIN_CSS.indexOf(name + " {");
  if (at < 0) return "";
  const close = ADMIN_CSS.indexOf("}", at);
  if (close < 0) return "";
  return ADMIN_CSS.slice(at, close);
}

describe("管理画面は、問題指摘の問題文を改行を保って出す", () => {
  test("report-q が pre-wrap を持つ", () => {
    const block = cssBlock(".report-q");
    expect(block.length > 0).toBe(true);
    expect(block.indexOf("white-space: pre-wrap") >= 0).toBe(true);
  });

  test("report-q が長い1語で横にはみ出さない", () => {
    expect(cssBlock(".report-q").indexOf("word-break: break-word") >= 0).toBe(true);
  });

  test("兄弟の report-message も pre-wrap のままである", () => {
    expect(cssBlock(".report-message").indexOf("white-space: pre-wrap") >= 0).toBe(true);
  });

  test("兄弟の aq-text も pre-wrap のままである", () => {
    const at = ADMIN_CSS.indexOf(".analytics-q-table .aq-text");
    expect(at > 0).toBe(true);
    const close = ADMIN_CSS.indexOf("}", at);
    expect(ADMIN_CSS.slice(at, close).indexOf("white-space: pre-wrap") >= 0).toBe(true);
  });
});
