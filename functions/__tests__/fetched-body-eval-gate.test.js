//
// 取得した本文を評価する所の台帳。増えたら落ちる。
//
// なぜ要るか (2026-11-09 に社長が本番で踏んだ)。同一ドメインに置いたファイルは
// 無くても 404 にならず、catch-all rewrite が 200 で index.html を返す。
// res.ok は真で、本文は頁である。それを new Function に渡すと SyntaxError に
// なり、科目が開かない。2026-11-14 に4箇所を閉じた。
// だが「4箇所とも閉じた」は、5箇所目を足した日に何の役にも立たない。
//
// この1枚が見るのは、箇所が増えたか減ったかだけである。
// 門が本当に効いているかは字面では決められない (呼び元に門が在る形も、
// 入れ子の関数で囲みを取り違える形も在る。2026-11-14 に実測した)。
// 効きのほうは振る舞いで見る見張りが4枚ある:
//   subject-data-html-fallback / subject-data-html-paths /
//   subject-data-html-admin / subject-data-html-catalog
// ここは、その4枚が知らない5箇所目が足された日に落ちる関門である。
// 落ちたら、足した所が頁を評価しうるかを自分で読んで、台帳に1行足すこと。
// 円記号がパッチの口を通らないので、正規表現は1つも使わない。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const JS_DIR = path.join(ROOT, "js");
const CALL = "new Function(";

// 台帳。file は js の配下の名前、count はその1枚の中の箇所数、
// why はその箇所が頁を評価しうるかと、どこで守っているか
const LEDGER = [
  {
    file: "subject-catalog.js",
    count: 1,
    why: "catalog.js の件数取り。頁を評価しうる。門は同じ関数の中に在り、subject-data-html-catalog が効きを見ている",
  },
  {
    file: "admin-question-stats-shared.js",
    count: 1,
    why: "管理画面の問題マスタ読込。頁を評価しうる。門は同じ関数の中に在り、subject-data-html-admin が効きを見ている",
  },
  {
    file: "subject-loader.js",
    count: 3,
    why: "evalDataScript (門は呼び元2つ。loadDataScript と、2026-11-15 に足した fetchSubjectDefinition。後者の効きは mix-subject-data-gate が見ている) と fetchQuizBundle (門は fetchText) と loadSubjectSummary (呼び元0件の死んだ関数。画面から呼ぶ日が来たら門を通すこと。ミックスは fetchSubjectDefinition を通るので、この道は生きていない)",
  },
];

function scan() {
  const found = {};
  fs.readdirSync(JS_DIR)
    .filter((f) => f.endsWith(".js"))
    .forEach((file) => {
      const src = fs.readFileSync(path.join(JS_DIR, file), "utf8");
      let n = 0;
      let at = src.indexOf(CALL);
      while (at !== -1) {
        n += 1;
        at = src.indexOf(CALL, at + 1);
      }
      if (n > 0) found[file] = n;
    });
  return found;
}

describe("約束1: 走査そのものが効いている", () => {
  test("箇所を1つ以上拾う", () => {
    const found = scan();
    expect(Object.keys(found).length > 0).toBe(true);
  });

  test("数え方が、同じ1枚の中の2箇所目も数える", () => {
    // 走査の自己試験。これが無いと、走査が1枚1箇所しか数えなくても
    // 下の約束2が通ってしまう (失敗の型15)
    const probe = "a " + CALL + "x); b " + CALL + "y);";
    let n = 0;
    let at = probe.indexOf(CALL);
    while (at !== -1) {
      n += 1;
      at = probe.indexOf(CALL, at + 1);
    }
    expect(n).toBe(2);
  });
});

describe("約束2: 台帳と実物が1箇所も食い違わない", () => {
  test("台帳に無い1枚が、評価していない", () => {
    const found = scan();
    const known = LEDGER.map((e) => e.file).sort();
    expect(Object.keys(found).sort()).toEqual(known);
  });

  test("1枚あたりの箇所数が、台帳と一致する", () => {
    const found = scan();
    LEDGER.forEach((e) => {
      expect(found[e.file]).toBe(e.count);
    });
  });

  test("台帳の各行が、なぜ守られているかを書いている", () => {
    // 理由の無い行を足して数だけ合わせる逃げ方を塞ぐ
    LEDGER.forEach((e) => {
      expect(typeof e.why).toBe("string");
      expect(e.why.length > 20).toBe(true);
    });
  });
});
