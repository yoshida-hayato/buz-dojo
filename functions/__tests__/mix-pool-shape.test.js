//
// ミックス出題 第3段: 1科目だけ渡したときと、壊れた入力。
// 混ぜる形が、混ぜない形の上位互換になっていることを見る。1枚を割って
// あるのは、1通が5,000字に入らないためである。
//
const H = require("../test-helpers/mix-pool-sandbox.js");

const DATA = {};
H.LOCAL_IDS.forEach((id) => { DATA[id] = H.entriesOf(id); });

describe("約束3: 1科目だけ渡したときと、壊れた入力", () => {
  test("1科目だけなら、同じ絞りの buildPoolFrom と顔ぶれが一致する", () => {
    const b = H.load(DATA["fe-kamoku-b"]);
    const e = DATA["fe-kamoku-b"];
    const src = H.source("fe-kamoku-b", e);
    const mixed = b.buildMixedPoolFrom(H.BASE_SETTINGS, [src]);
    const st = Object.assign({}, H.BASE_SETTINGS, {
      categories: [...new Set(e.map((q) => q.category))],
      priorities: [...new Set(e.map((q) => q.priority))],
    });
    const plain = b.buildPoolFrom(st, src);
    expect(mixed.map((s) => s.entry.id).join(",")).toBe(plain.map((s) => s.entry.id).join(","));
  });

  test("空・科目 id 無し・問題0件は、落ちずに飛ばす", () => {
    const b = H.load([]);
    expect(b.buildMixedPoolFrom(H.BASE_SETTINGS, []).length).toBe(0);
    expect(b.buildMixedPoolFrom(H.BASE_SETTINGS, null).length).toBe(0);
    const broken = [
      null,
      H.source("", DATA["fe-kamoku-a"]),
      H.source("x", []),
      H.source("y", null),
      H.source("z", "問題ではない字"),
      H.source("fe-kamoku-a", DATA["fe-kamoku-a"]),
    ];
    expect(b.buildMixedPoolFrom(H.BASE_SETTINGS, broken).length).toBe(46);
  });
});
