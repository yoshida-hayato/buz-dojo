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


test("権利を買った後は、切り下げが消える", () => {
  const h = H.load(H.usageSeed({ sap: 19, "biz-career": 19 }));
  const before = h.ent.canStartMixed(["sap", "biz-career"], 10);
  expect(before.cappedTo).toBe(2);
  h.ent.startSync("uid-3");
  h.snapshot({ pack: true, subjects: {} });
  const after = h.ent.canStartMixed(["sap", "biz-career"], 10);
  expect(Number.isFinite(after.remaining)).toBe(false);
  expect(after.cappedTo).toBe(undefined);
});

test("空の一覧では開始できない", () => {
  const h = H.load(H.usageSeed({}));
  expect(h.ent.canStartMixed([], 10).ok).toBe(false);
  expect(h.ent.canStartMixed(null, 10).ok).toBe(false);
  expect(h.ent.canStartMixed(["", null], 10).ok).toBe(false);
});

test("頼んだ数が壊れていても、残りを超えない", () => {
  // 負の数をそのまま返すと、呼び元の slice が末尾から削る形になり、
  // 残り2問の人に95問を配る (2026-11-15 に実測)。無料枠の境目なので
  // 読めない数は「指定なし」と同じに扱って残りぜんぶにする。
  const h = H.load(H.usageSeed({ sap: 18 }));
  const bads = [-1, -5, 0, "ななめ", null, undefined, NaN, -Infinity];
  bads.forEach((w) => {
    const g = h.ent.canStartMixed(["sap"], w);
    expect(g.ok).toBe(true);
    expect(g.cappedTo).toBe(2);
    expect(h.ent.canStart("sap", w).cappedTo).toBe(2);
  });
});

test("整数でない数は、切り捨てる", () => {
  // 3.7 を渡すと「3.7問で始めますか」と聞くことになり、slice も3問しか取らない。
  const h = H.load(H.usageSeed({}));
  expect(h.ent.canStartMixed(["sap", "biz-career"], 3.7).cappedTo).toBe(3);
  expect(h.ent.canStart("sap", 7.9).cappedTo).toBe(7);
});

test("画面の選択肢では、切り下げの答えが変わっていない", () => {
  // 1,248通りの組 (科目13本 x 使った数6通り x 科目の組4通り x 選択肢4つ) で
  // 直す前と後の出力が一致することを測ってある。ここはその代表を固定する。
  const h = H.load(H.usageSeed({ sap: 12, "biz-career": 20 }));
  expect(h.ent.canStartMixed(["sap", "biz-career"], 10).cappedTo).toBe(8);
  expect(h.ent.canStartMixed(["sap", "biz-career"], 20).cappedTo).toBe(8);
  expect(h.ent.canStartMixed(["sap", "biz-career"], "all").cappedTo).toBe(8);
  expect(h.ent.canStart("sap", 10).cappedTo).toBe(8);
  expect(h.ent.canStart("sap", 30).cappedTo).toBe(8);
});

test("枠を切る所も、読めない数では全部にする", () => {
  // 無料枠の門を通らない経路 (権利が在る科目) では、頼んだ数が
  // そのまま slice に渡る。負の数は末尾から削る形になるので、
  // Entitlement と同じ規則 (読めない数は指定なし) をここでも当てる。
  const fs = require("fs");
  const path = require("path");
  const ENGINE = fs.readFileSync(
    path.join(__dirname, "..", "..", "js", "quiz-engine.js"),
    "utf8"
  );
  expect(ENGINE.split("slots.slice(0, Number(settings.count))").length - 1).toBe(0);
  expect(ENGINE.split("const want = Math.floor(Number(settings.count));").length - 1).toBe(1);
  expect(ENGINE.split("if (want > 0) slots = slots.slice(0, want);").length - 1).toBe(1);
});
