//
// ミックス出題の無料枠: 科目ごとの上限の一覧 (Entitlement.mixedQuotaCaps)。
//
// この1枚は 2026-11-15 06:48便 が出して破棄された。理由は順番で、
// 足し算の本体を足す件より先にこの見張りを投稿したので、当たった時点では
// 3つの関数がまだ無く、canStartMixed is not a function で落ちた。
// 12:48便 に出し直す。入口で数え直したら、この2枚が落ちたぶん
// mixedQuotaCaps と canStartMixed を見るテストは repo 全体で0件だった。
// 課金の境目に見張りが1件も無い状態なので、ここを先に閉じる。
//
// 規則。無料ぶんは科目ごとに1日20問で、総量制にはしない (社長の回答
// 2026-10-18)。だから返すのは科目ごとの上限の一覧で、総数ではない。
// 総数だけを返すと、残り3問の科目から10枠を取ってしまう。
//
const H = require("../test-helpers/entitlement-sandbox.js");

const FREE = 20;

test("使っていない3科目は、どれも1日ぶんの上限を持つ", () => {
  const h = H.load(H.usageSeed({}));
  const caps = h.ent.mixedQuotaCaps(["sap", "biz-career", "excel-functions"]);
  expect(caps.length).toBe(3);
  expect(caps[0].subjectId).toBe("sap");
  expect(caps[0].cap).toBe(FREE);
  expect(caps[1].cap).toBe(FREE);
  expect(caps[2].cap).toBe(FREE);
});

test("使ったぶんだけ、その科目の上限が減る", () => {
  const h = H.load(H.usageSeed({ sap: 17, "biz-career": 20 }));
  const caps = h.ent.mixedQuotaCaps(["sap", "biz-career", "excel-functions"]);
  expect(caps[0].cap).toBe(3);
  expect(caps[1].cap).toBe(0);
  expect(caps[2].cap).toBe(FREE);
});

test("無料科目の上限は無い", () => {
  // 問題数が100以下の科目は全問無料なので、1日の枠を持たない。
  const h = H.load(H.usageSeed({}));
  const caps = h.ent.mixedQuotaCaps(["outlook-mail", "sap"]);
  const free = caps.filter((r) => r.subjectId === "outlook-mail")[0];
  expect(Number.isFinite(free.cap)).toBe(false);
  expect(free.cap > 1000000).toBe(true);
});

test("同じ科目を2度渡しても、上限の行は1つ", () => {
  // 一覧の行は枠を落とす側が科目ごとに使う。2行在ると、同じ科目に
  // 2倍の枠を配ることになる。
  const h = H.load(H.usageSeed({ sap: 5 }));
  const caps = h.ent.mixedQuotaCaps(["sap", "sap", "biz-career", "sap"]);
  expect(caps.length).toBe(2);
  expect(caps[0].subjectId).toBe("sap");
  expect(caps[0].cap).toBe(15);
  expect(caps[1].subjectId).toBe("biz-career");
});

test("空の名前と壊れた一覧は、行を作らない", () => {
  const h = H.load(H.usageSeed({}));
  const caps = h.ent.mixedQuotaCaps(["", null, undefined, "sap"]);
  expect(caps.length).toBe(1);
  expect(caps[0].subjectId).toBe("sap");
  expect(h.ent.mixedQuotaCaps(null).length).toBe(0);
  expect(h.ent.mixedQuotaCaps("sap").length).toBe(0);
});

test("総数は科目ごとの足し算で、1本でも上限が無ければ総数も無い", () => {
  const h = H.load(H.usageSeed({ sap: 17, "biz-career": 20 }));
  expect(h.ent.mixedQuotaRemaining(["sap", "biz-career"])).toBe(3);
  expect(h.ent.mixedQuotaRemaining(["sap", "excel-functions"])).toBe(23);
  const withFree = h.ent.mixedQuotaRemaining(["sap", "outlook-mail"]);
  expect(Number.isFinite(withFree)).toBe(false);
});

test("パックを買っていれば、有料科目にも上限が無い", () => {
  // 使い切った科目でも、権利が在れば上限は消える。ここが課金の境目である。
  const h = H.load(H.usageSeed({ sap: 20, "biz-career": 20 }));
  const before = h.ent.mixedQuotaCaps(["sap", "biz-career"]);
  expect(before[0].cap).toBe(0);
  expect(before[1].cap).toBe(0);
  h.ent.startSync("uid-1");
  h.snapshot({ pack: true, subjects: {} });
  const caps = h.ent.mixedQuotaCaps(["sap", "biz-career"]);
  expect(Number.isFinite(caps[0].cap)).toBe(false);
  expect(Number.isFinite(caps[1].cap)).toBe(false);
});

test("単品を買った科目だけ、上限が消える", () => {
  const h = H.load(H.usageSeed({ sap: 20, "biz-career": 20 }));
  h.ent.startSync("uid-2");
  h.snapshot({ pack: false, subjects: { sap: { status: "active" } } });
  const caps = h.ent.mixedQuotaCaps(["sap", "biz-career"]);
  expect(Number.isFinite(caps[0].cap)).toBe(false);
  expect(caps[1].cap).toBe(0);
});
