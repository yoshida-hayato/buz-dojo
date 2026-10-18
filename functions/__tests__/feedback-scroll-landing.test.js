// 回答後に解説カードの頭が画面の上に消えないことのガード。
//
// 2026-10-18 09:05 に社長から「サイトの表示があまり好きではないので、
// 学習系のプラットフォームも参考に UI を大幅に改造してほしい」と依頼を受けた。
// その続きで出題画面を Chromium で描いて測ったところ、回答後のスクロールが
// 解説を飛び越していることが分かった。
//
// 原因は、回答後のスクロールが設計されたものではなく、next-btn への
// focus() の副作用だったことである。ブラウザはフォーカスした要素を見せるので、
// 解説が長いほど下へ送られ、正解・不正解の行と解説の冒頭が画面の上に消える。
// 12:48便 は「自動スクロールは既に実装されている」と書いたが、これは誤りで、
// 実装されていたのは focus() だけだった。挙動を見て原因を決めないこと。
//
// 実測 (390x844。文書座標は変わらないので画面 y で比べる):
//   解説 118px   修正前 解説の頭 y=266    修正後 y=647
//   解説 476px   修正前 解説の頭 y=-92    修正後 y=289
//   解説 1461px  修正前 解説の頭 y=-1078  修正後 y=198
// 360x640 と 1280x900 でも、カードの頭は追従ヘッダーの下 (y=80 / y=103) に収まる。
//
// nearest を選んだ理由: カードが画面に収まるときは下端合わせになるので、
// 自分が選んだ選択肢の色を残したまま解説が読める。next-btn はカードの中に
// 在るので、収まる場合は必ず画面内に入る (360 / 390 / 1280 の3幅で実測)。
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = fs.readFileSync(path.join(ROOT, "js", "quiz-engine.js"), "utf8");
const QUIZ_CSS = fs.readFileSync(path.join(ROOT, "css", "quiz.css"), "utf8");
const HEADER_CSS = fs.readFileSync(path.join(ROOT, "css", "header.css"), "utf8");

// 空白を畳む。正規表現に量指定子のアスタリスクを書けないため
const squish = (s) => s.split(/\s+/).join("");

describe("回答後は解説カードの頭が見えるところで止まる", () => {
  test("解説カードを見せる関数が在り、nearest で送る", () => {
    expect(ENGINE.indexOf("function revealFeedbackCard(") >= 0).toBe(true);
    const body = squish(ENGINE.split("function revealFeedbackCard(")[1].split("\n}")[0]);
    expect(body.indexOf('block:"nearest"') >= 0).toBe(true);
    // start にすると、カードが収まる場合でも問題文と選択肢が画面の外へ出る
    expect(body.indexOf('block:"start"') >= 0).toBe(false);
  });

  test("解説カードを出した直後に呼ばれる", () => {
    const i = ENGINE.indexOf('card.classList.add(isCorrect ? "is-correct" : "is-wrong")');
    const j = ENGINE.indexOf("revealFeedbackCard(card)");
    const k = ENGINE.indexOf("scheduleNextBtnFocus()");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(k).toBeGreaterThan(j);
  });

  test("next-btn のフォーカスはスクロールを起こさない", () => {
    const e = squish(ENGINE);
    expect(e.indexOf("btn.focus({preventScroll:true})") >= 0).toBe(true);
    // 素の focus() が残っていると、止めた位置から下へ送り直されてしまう
    expect(e.indexOf("btn.focus()") >= 0).toBe(false);
  });

  test("カードの頭が追従ヘッダーに隠れない余白が在る", () => {
    const m = squish(QUIZ_CSS).match(/\.feedback-card\{scroll-margin-top:(\d+)px/);
    expect(!!m).toBe(true);
    // ヘッダーは sticky で top 0 なので、その高さぶんは最低でも要る
    expect(squish(HEADER_CSS).indexOf("position:sticky") >= 0).toBe(true);
    expect(Number(m[1])).toBeGreaterThanOrEqual(68);
  });
});
