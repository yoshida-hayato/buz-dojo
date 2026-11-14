//
// ミックス出題 第3段: 枠に押した母集団が、本当に効いているか。
//
// この repo に問題データが在る3科目は、全問が自前の肢を持つ。だから
// 母集団を渡しても渡さなくても肢は 4つ で変わらない (2026-11-15 に246問で
// 実測した)。母集団が効くのは、自前の肢を持たない形 (SAP の用語・Tコード) で、
// その科目のマスタはよその repo に在るので手元では読めない。
//
// そこで同じ形の2科目を作って測る。渡さないと、相手の科目の語が肢に混ざる。
// 利用者から見ると「基本情報の問題なのに、肢に SAP の用語が並ぶ」である。
//
const H = require("../test-helpers/mix-pool-sandbox.js");

const ALPHA = H.termEntries("alpha-", 30);
const BETA = H.termEntries("beta-", 30);
const SETTINGS = Object.assign({}, H.BASE_SETTINGS, { categories: ["term"] });

function slotsFor(bag) {
  return bag.buildMixedPoolFrom(SETTINGS, [
    H.source("alpha", ALPHA),
    H.source("beta", BETA),
  ]);
}

// 開いている科目は alpha。だから母集団を渡さないと beta の問題が alpha を引く
function leakCount(bag, usePool) {
  const slots = slotsFor(bag);
  let leaked = 0;
  slots.forEach((s) => {
    const q = bag.buildQuestion(s.entry, SETTINGS, false, usePool ? s.pool : undefined);
    if (!q || !Array.isArray(q.choices)) return;
    const other = s.subjectId === "alpha" ? "beta" : "alpha";
    if (q.choices.some((c) => String(c).indexOf(other) === 0)) leaked += 1;
  });
  return { leaked, n: slots.length };
}

describe("約束: 誤答は、その問題の科目から引く", () => {
  test("枠は60で、肢は6つそろう", () => {
    const bag = H.load(ALPHA);
    const slots = slotsFor(bag);
    expect(slots.length).toBe(60);
    const counts = new Set(
      slots.map((s) => bag.buildQuestion(s.entry, SETTINGS, false, s.pool).choices.length)
    );
    expect([...counts]).toEqual([6]);
  });

  test("母集団を渡すと、他科目の語は1問も肢に混ざらない", () => {
    const bag = H.load(ALPHA);
    expect(leakCount(bag, true).leaked).toBe(0);
  });

  test("母集団を渡さないと、相手の科目の30問とも肢が混ざる", () => {
    // この1件が、枠に押した pool が load-bearing であることの証拠である。
    // 落ちるようになったら、押すのをやめたか、押す先を間違えている
    const bag = H.load(ALPHA);
    expect(leakCount(bag, false).leaked).toBe(30);
  });

  test("開いている科目を入れ替えると、混ざる側も入れ替わる", () => {
    // 足場の自己試験。漏れの数が開いている科目に現に依るかを見る
    const bag = H.load(BETA);
    expect(leakCount(bag, false).leaked).toBe(30);
    expect(leakCount(bag, true).leaked).toBe(0);
  });
});
