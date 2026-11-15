//
// ミックス出題 第3段: 無料20問の枠の足し算。
// capMixedSlotsByQuota が、科目ごとの上限を現に守っていることを見る1枚。
//
// なぜ総数ではなく科目ごとの上限なのか。無料ぶんは科目ごとに1日20問で、
// 総量制にはしない (社長の回答 2026-10-18)。総数だけで切ると、残り3問の
// 科目から10枠を配ってしまい、7問ぶんが回答のたびに壁へ当たる。
//
// ここは現に課金が動いている境目なので、落とす側 (fail closed) に倒して
// あることも見る。科目の分からない枠と、一覧に無い科目の枠は出さない。
//
const vm = require("vm");
const H = require("../test-helpers/mix-pool-sandbox.js");

const IDS = H.LOCAL_IDS;
const SRCS = IDS.map((id) => H.source(id, H.entriesOf(id)));
const ST = Object.assign({}, H.BASE_SETTINGS, { poolMode: "all" });

function harness() {
  const b = H.load(SRCS[0].entries);
  return {
    cap: vm.runInContext("capMixedSlotsByQuota", b.ctx),
    slots: b.buildMixedPoolFrom(ST, SRCS),
  };
}

function countBySubject(list) {
  const m = {};
  list.forEach((s) => {
    m[s.subjectId] = (m[s.subjectId] || 0) + 1;
  });
  return m;
}

function capsOf(value) {
  return IDS.map((id) => ({ subjectId: id, cap: value }));
}

describe("枠の足し算: 科目ごとの上限を守る", () => {
  test("上限が無い科目 (権利あり) は1枠も落とさない", () => {
    const h = harness();
    expect(h.slots.length).toBe(246);
    const out = h.cap(h.slots, capsOf(Infinity));
    expect(out.length).toBe(246);
    expect(countBySubject(out)["fe-kamoku-a"]).toBe(46);
  });

  test("3科目とも20問なら、総数は60で内訳も20ずつ", () => {
    const h = harness();
    const out = h.cap(h.slots, capsOf(20));
    expect(out.length).toBe(60);
    const m = countBySubject(out);
    expect(m["fe-kamoku-a"]).toBe(20);
    expect(m["fe-kamoku-b"]).toBe(20);
    expect(m["ap-kamoku-b"]).toBe(20);
  });

  test("1本だけ残り3問なら、その科目だけ3枠になる", () => {
    const h = harness();
    const caps = IDS.map((id, i) => ({ subjectId: id, cap: i === 0 ? 3 : 20 }));
    const out = h.cap(h.slots, caps);
    expect(out.length).toBe(43);
    expect(countBySubject(out)[IDS[0]]).toBe(3);
  });

  test("持っている問題数より上限が大きければ、問題数のほうで止まる", () => {
    const h = harness();
    const out = h.cap(h.slots, capsOf(500));
    expect(out.length).toBe(246);
  });

  test("使い切った科目の枠は1つも出さない", () => {
    const h = harness();
    const out = h.cap(h.slots, capsOf(0));
    expect(out.length).toBe(0);
  });

  test("無料1本と使い切り2本なら、無料の46問だけが残る", () => {
    const h = harness();
    const caps = IDS.map((id, i) => ({
      subjectId: id,
      cap: i === 0 ? Infinity : 0,
    }));
    const out = h.cap(h.slots, caps);
    expect(out.length).toBe(46);
    expect(countBySubject(out)[IDS[0]]).toBe(46);
  });
});
