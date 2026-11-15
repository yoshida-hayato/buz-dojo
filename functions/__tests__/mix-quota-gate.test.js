//
// ミックス出題の開始の門 (Entitlement.canStartMixed)。
//
// この1枚も 2026-11-15 06:48便 が出して破棄された (足し算の本体より先に
// 投稿したので、当たった時点で関数が無かった)。12:48便 に出し直す。
//
// 形は1科目のときの canStart と同じにしてある。ok が偽なら壁を出し、
// cappedTo が頼んだ数より小さければ「N問で始めますか」を聞く。
// caps を一緒に返すのは、画面が枠を落とす側 (capMixedSlotsByQuota) に
// そのまま渡すためである。総数だけ渡すと、残り3問の科目から10枠を取る。
//
const H = require("../test-helpers/entitlement-sandbox.js");

test("残りが在れば開始でき、頼んだ数がそのまま通る", () => {
  const h = H.load(H.usageSeed({}));
  const g = h.ent.canStartMixed(["sap", "biz-career"], 10);
  expect(g.ok).toBe(true);
  expect(g.remaining).toBe(40);
  expect(g.cappedTo).toBe(10);
  expect(g.caps.length).toBe(2);
});

test("残りより多く頼んだら、残りまで切り下げる", () => {
  const h = H.load(H.usageSeed({ sap: 17, "biz-career": 18 }));
  const g = h.ent.canStartMixed(["sap", "biz-career"], 30);
  expect(g.ok).toBe(true);
  expect(g.remaining).toBe(5);
  expect(g.cappedTo).toBe(5);
});

test("全問を頼んだら、残りの総数になる", () => {
  const h = H.load(H.usageSeed({ sap: 12 }));
  const g = h.ent.canStartMixed(["sap", "biz-career"], "all");
  expect(g.remaining).toBe(28);
  expect(g.cappedTo).toBe(28);
});

test("どの科目も使い切っていたら、開始できない", () => {
  const h = H.load(H.usageSeed({ sap: 20, "biz-career": 20 }));
  const g = h.ent.canStartMixed(["sap", "biz-career"], 10);
  expect(g.ok).toBe(false);
  expect(g.remaining).toBe(0);
  expect(g.reason).toBe("limit");
  expect(g.caps.length).toBe(2);
});

test("1本でも使い切っていない科目が在れば、開始できる", () => {
  // 1科目ずつなら解けていた20問が、ミックスからは触れなくなる形にしない。
  const h = H.load(H.usageSeed({ sap: 20, "biz-career": 20, "excel-functions": 3 }));
  const g = h.ent.canStartMixed(["sap", "biz-career", "excel-functions"], 10);
  expect(g.ok).toBe(true);
  expect(g.remaining).toBe(17);
  expect(g.cappedTo).toBe(10);
});

test("無料科目が1本混ざれば、切り下げは起きない", () => {
  const h = H.load(H.usageSeed({ sap: 20 }));
  const g = h.ent.canStartMixed(["sap", "outlook-mail"], 30);
  expect(g.ok).toBe(true);
  expect(Number.isFinite(g.remaining)).toBe(false);
  expect(g.cappedTo).toBe(undefined);
});

