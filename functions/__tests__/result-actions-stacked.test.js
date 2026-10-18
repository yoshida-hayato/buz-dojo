//
// 結果画面の操作ボタンのガード。
//
// なぜ要るか (2026-10-18 14:48便の実測、Chromium で描いて測った):
// 結果画面の操作は3つ (つまずいた問題を復習 / 同じ設定でもう一度 / ホームへ戻る)。
// .result-actions は flex の row で flex-wrap wrap だけなので、幅が足りないと
// 内容幅のまま段に折り返す。390x844 では 322 / 200 / 143 の階段になり、
// 主な操作である もう一度 が、従であるはずの 復習 より細く見えていた。
// 561 から 799 の幅 (タブレット) では3つが2段に割れ、下段が左に寄っていた。
//
// 1段に収まる最小の幅は実測で 800 だった (799 では割れ、800 では y が揃う)。
// だから 799 以下を縦積みにして、3つとも同じ幅・同じ下端で並べる。
// 800 以上は1pxも変えていない (338 / 200 / 143 のまま)。
//
// 量指定子を使う正規表現はパッチ経路を通らないので indexOf で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const QUIZ_CSS = fs.readFileSync(path.join(ROOT, "css", "quiz.css"), "utf8");

// 指定の塊を1つ取り出す。先頭の目印から、次の閉じ波括弧までを返す
function blockAfter(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return "";
  const close = src.indexOf("}", i + marker.length);
  if (close < 0) return "";
  return src.slice(i, close + 1);
}

function countOf(src, needle) {
  let n = 0;
  let i = src.indexOf(needle);
  while (i >= 0) {
    n += 1;
    i = src.indexOf(needle, i + needle.length);
  }
  return n;
}

describe("結果画面の操作ボタンは狭い幅で縦に積む", () => {
  test("799px 以下の指定が1つだけ在る", () => {
    expect(countOf(QUIZ_CSS, "@media (max-width: 799px)")).toBe(1);
  });

  test("その中で .result-actions は縦並びになる", () => {
    const media = QUIZ_CSS.indexOf("@media (max-width: 799px)");
    expect(media).toBeGreaterThan(-1);
    const col = blockAfter(QUIZ_CSS.slice(media), ".result-actions {");
    expect(col.indexOf("flex-direction: column") >= 0).toBe(true);
    expect(col.indexOf("align-items: stretch") >= 0).toBe(true);
  });

  test("3つのボタンが同じ幅になる (primary と secondary の両方を含む)", () => {
    const media = QUIZ_CSS.indexOf("@media (max-width: 799px)");
    const tail = QUIZ_CSS.slice(media);
    expect(tail.indexOf(".result-actions .primary-btn") >= 0).toBe(true);
    expect(tail.indexOf(".result-actions .secondary-btn") >= 0).toBe(true);
    const btn = blockAfter(tail, ".result-actions .secondary-btn {");
    expect(btn.indexOf("width: 100%") >= 0).toBe(true);
    expect(btn.indexOf("max-width: 420px") >= 0).toBe(true);
    expect(btn.indexOf("min-height: 52px") >= 0).toBe(true);
  });

  test("800px 以上の既定は変えていない (row のまま)", () => {
    const base = blockAfter(QUIZ_CSS, ".result-actions { display: flex;");
    expect(base.indexOf("flex-wrap: wrap") >= 0).toBe(true);
    expect(base.indexOf("flex-direction") >= 0).toBe(false);
  });

  test("hidden が勝つので、隠れているボタンは出てこない", () => {
    const base = fs.readFileSync(path.join(ROOT, "css", "base.css"), "utf8");
    const i = base.indexOf(".screen.hidden, .hidden {");
    expect(i).toBeGreaterThan(-1);
    const rule = blockAfter(base, ".screen.hidden, .hidden {");
    expect(rule.indexOf("display: none") >= 0).toBe(true);
    expect(rule.indexOf("important") >= 0).toBe(true);
  });
});
