//
// ミックス出題 第3段: 枠の足し算の、落とす側の約束。
// 上限どおりに取る側は mix-quota-cap-slots が見る。ここは
// 「出さない」と決めている入力だけを見る。
//
// ここは現に課金が動いている境目なので、迷ったら出さない側 (fail closed)
// に倒してある。読めない上限が「上限なし」に化けないことまで見る。
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

describe("枠の足し算: 落とす側に倒す", () => {
  test("一覧に無い科目の枠は出さない", () => {
    const h = harness();
    const out = h.cap(h.slots, [{ subjectId: IDS[1], cap: 20 }]);
    expect(out.length).toBe(20);
    expect(countBySubject(out)[IDS[1]]).toBe(20);
    expect(countBySubject(out)[IDS[0]]).toBe(undefined);
  });

  test("一覧が空なら1枠も出さない", () => {
    const h = harness();
    expect(h.cap(h.slots, []).length).toBe(0);
    expect(h.cap(h.slots, null).length).toBe(0);
  });

  test("科目の分からない枠は出さない", () => {
    const h = harness();
    const noId = h.slots.slice(0, 5).map((s) =>
      Object.assign({}, s, { subjectId: undefined })
    );
    expect(h.cap(noId, capsOf(20)).length).toBe(0);
  });

  test("枠が空でも落ちない", () => {
    const h = harness();
    expect(h.cap([], capsOf(20)).length).toBe(0);
    expect(h.cap(null, capsOf(20)).length).toBe(0);
  });
});

describe("枠の足し算: 並びを変えない", () => {
  // 入力を entry.id で並べてから渡すと、出力を並べ直す壊し方が素通りする
  // (2026-11-15 に実測。失敗の型6)。だから混ざったままの並びで渡す。
  test("出てきた枠は、渡した並びの部分列である", () => {
    const h = harness();
    const mixed = [];
    for (let i = 0; i < h.slots.length; i++) {
      mixed.push(h.slots[(i * 7 + 3) % h.slots.length]);
    }
    const out = h.cap(mixed, capsOf(5));
    expect(out.length).toBe(15);
    let j = 0;
    mixed.forEach((s) => {
      if (j < out.length && out[j] === s) j++;
    });
    expect(j).toBe(out.length);
    // 並べ直されていないこと: 先頭の科目が entry.id の最小とは限らない
    const ids = out.map((s) => s.entry.id);
    const asc = ids.slice().sort();
    expect(ids.join(",") === asc.join(",")).toBe(false);
  });
});

describe("枠の足し算: 読めない上限は1枠も出さない", () => {
  test("上限が未定義・数でない値なら、その科目は出ない", () => {
    const h = harness();
    const bad = [undefined, null, NaN, "20", {}];
    bad.forEach((v) => {
      const caps = IDS.map((id) => ({ subjectId: id, cap: v }));
      expect(h.cap(h.slots, caps).length).toBe(0);
    });
  });

  test("上限なしは Infinity だけ。文字の Infinity は通さない", () => {
    const h = harness();
    const caps = IDS.map((id) => ({ subjectId: id, cap: "Infinity" }));
    expect(h.cap(h.slots, caps).length).toBe(0);
  });
});

describe("枠の足し算: 科目 id が特別な字でも継承した値を拾わない", () => {
  test("toString という名前の科目でも、上限が無ければ出ない", () => {
    const h = harness();
    const odd = h.slots.slice(0, 4).map((s) =>
      Object.assign({}, s, { subjectId: "toString" })
    );
    expect(h.cap(odd, capsOf(20)).length).toBe(0);
    const caps = [{ subjectId: "toString", cap: 2 }];
    expect(h.cap(odd, caps).length).toBe(2);
  });
});

describe("枠の足し算: 上限の一覧そのものが壊れていても落ちない", () => {
  // この1件は scripts/dead-gate-scan.js が見つけた。
  // caps の行を捨てる門 (row が無い / subjectId が無い) を外しても、
  // 全試験が通っていた。壊れた一覧を渡す試験が1件も無かったためである。
  // 門は現に効いている (外すと null の行で落ちる) ので、入力を足した。
  test("一覧に null や科目名の無い行が混ざっても、投げない", () => {
    const h = harness();
    const caps = [null, { cap: 5 }, { subjectId: IDS[0], cap: 4 }, undefined];
    const out = h.cap(h.slots, caps);
    expect(out.length).toBe(4);
    expect(countBySubject(out)[IDS[0]]).toBe(4);
  });

  test("科目名の無い行は、上限の一覧に1つも入らない", () => {
    const h = harness();
    const odd = h.slots.slice(0, 3).map((s) =>
      Object.assign({}, s, { subjectId: "undefined" })
    );
    expect(h.cap(odd, [{ cap: 9 }]).length).toBe(0);
  });
});
