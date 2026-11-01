// 成績のグラフは、1枠が投げても残りが描かれること。
//
// 直す前は6枠が1つの try に同居しており、1枠が投げると残りが黙って空になった。
// catch は console.warn だけなので、利用者にも社員にも何も見えない。
// 実測で投げる入力は2つ特定した (QUIZ_DATA が未定義 / QuizStorage が未定義)。
// どちらも「カテゴリ別から下の4枠が空」という形で出る。
//
// 正規表現は使わない (パッチの口が円記号を運べない)。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const SRC = path.join(ROOT, "js", "screens-stats.js");

function el() {
  return {
    innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
  };
}

// 古典 script の最上位の関数宣言は大域の属性になるが、const は属性に
// ならない。だから完了値で受け取る (06:48便 の教訓)。
function loadDrawBlock() {
  const sandbox = { console: { warn() {} } };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  return vm.runInContext(
    fs.readFileSync(SRC, "utf8") + NL + "drawStatsBlock",
    ctx,
    { filename: "screens-stats.js" }
  );
}

describe("約束1: 1枠が投げても、残りの枠は描かれる", () => {
  const drawStatsBlock = loadDrawBlock();

  test("drawStatsBlock を受け取れている", () => {
    expect(typeof drawStatsBlock).toBe("function");
  });

  test("6枠のうち1枠が投げても、残り5枠は走る", () => {
    const names = ["a", "b", "c", "d", "e", "f"];
    names.forEach(function (bad) {
      const ran = [];
      names.forEach(function (n) {
        const box = el();
        drawStatsBlock(box, n, function () {
          if (n === bad) throw new Error("わざと投げる");
          ran.push(n);
        });
      });
      expect(ran.length).toBe(5);
      expect(ran.indexOf(bad)).toBe(-1);
    });
  });

  test("投げた枠は空ではなく、どの枠が駄目かが字面で出る", () => {
    const box = el();
    drawStatsBlock(box, "カテゴリ別", function () {
      throw new Error("わざと投げる");
    });
    expect(box.innerHTML.length).toBeGreaterThan(0);
    expect(box.innerHTML.indexOf("カテゴリ別")).toBeGreaterThan(-1);
  });

  test("投げなければ、枠の中身に触らない", () => {
    const box = el();
    box.innerHTML = "もとの中身";
    drawStatsBlock(box, "カテゴリ別", function () {});
    expect(box.innerHTML).toBe("もとの中身");
  });

  test("枠が無くても投げない (画面に要素が無い日)", () => {
    let threw = false;
    try {
      drawStatsBlock(null, "カテゴリ別", function () {
        throw new Error("わざと投げる");
      });
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
describe("約束2: 1つの try に2枠を同居させていない", () => {
  // 字面の有無ではなく、try の区画ごとに描画の呼び出しが1つ以下であることを見る。
  // 同居に戻す壊し方 (隔離をやめて1つの try に寄せる) は、これで落ちる。
  test("try の区画ごとに、描画の呼び出しは1つまで", () => {
    const text = fs.readFileSync(SRC, "utf8");
    const parts = text.split("try {");
    expect(parts.length).toBeGreaterThan(1);
    parts.slice(1).forEach(function (part) {
      const seg = part.split("catch")[0];
      let n = 0;
      let at = seg.indexOf("StatsAnalysis.render");
      while (at > -1) {
        n += 1;
        at = seg.indexOf("StatsAnalysis.render", at + 1);
      }
      expect(n).toBeLessThan(2);
    });
  });

  test("6枠とも drawStatsBlock を通している", () => {
    const text = fs.readFileSync(SRC, "utf8");
    let n = 0;
    let at = text.indexOf("drawStatsBlock(");
    while (at > -1) {
      n += 1;
      at = text.indexOf("drawStatsBlock(", at + 1);
    }
    // 宣言1つ + 呼び出し6つ
    expect(n).toBeGreaterThan(6);
  });
});
