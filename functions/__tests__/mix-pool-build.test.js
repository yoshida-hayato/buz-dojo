//
// ミックス出題 第3段: 科目をまたいだ出題枠を組む。
//
// なぜ要るか (2026-11-15 に実測)。buildPoolFrom は絞り (分野・優先度) を
// 引数の settings からそのまま当てる。開いている科目の絞りを他科目に
// 素で当てると、当たらない科目が丸ごと落ちる。3科目の実データで、
// 優先度の絞り7通りを素で当てると 246枠が 21枠から 246枠 の幅で揺れ、
// いちばん悪い場合 (優先度3だけ) は 225枠が黙って消える。
// 分野も同じ形で、科目ごとに分野名が別物なので揃わない。
//
// buildMixedPoolFrom は、科目ごとにその科目が現に持つ分野と優先度を通し、
// 出てきた枠に subjectId と母集団を押す。quiz-engine は既に両方を読む。
//
const H = require("../test-helpers/mix-pool-sandbox.js");

const DATA = {};
H.LOCAL_IDS.forEach((id) => { DATA[id] = H.entriesOf(id); });
const SOURCES = () => H.LOCAL_IDS.map((id) => H.source(id, DATA[id]));

describe("約束1: 科目ごとに枠が出て、枠が科目と母集団を持つ", () => {
  test("3科目で246枠。内訳は 46 / 100 / 100", () => {
    const b = H.load(DATA["ap-kamoku-b"]);
    const slots = b.buildMixedPoolFrom(H.BASE_SETTINGS, SOURCES());
    expect(slots.length).toBe(246);
    const by = {};
    slots.forEach((s) => { by[s.subjectId] = (by[s.subjectId] || 0) + 1; });
    expect(by["fe-kamoku-a"]).toBe(46);
    expect(by["fe-kamoku-b"]).toBe(100);
    expect(by["ap-kamoku-b"]).toBe(100);
  });

  test("全部の枠が subjectId と、自分の科目の母集団を持つ", () => {
    const b = H.load(DATA["ap-kamoku-b"]);
    const slots = b.buildMixedPoolFrom(H.BASE_SETTINGS, SOURCES());
    expect(slots.filter((s) => !s.subjectId).length).toBe(0);
    expect(slots.filter((s) => !Array.isArray(s.pool)).length).toBe(0);
    // 母集団は、その枠の科目の entries そのもの (参照で見る)
    expect(slots.filter((s) => s.pool !== DATA[s.subjectId]).length).toBe(0);
  });

  test("記述式には1枠も倒れない", () => {
    const b = H.load(DATA["ap-kamoku-b"]);
    const inputAll = new Set(["scenario"]);
    const srcs = H.LOCAL_IDS.map((id) => H.source(id, DATA[id], { inputCategories: inputAll }));
    const slots = b.buildMixedPoolFrom(
      Object.assign({}, H.BASE_SETTINGS, { answerMode: "input" }), srcs
    );
    expect(slots.length).toBe(246);
    expect(slots.filter((s) => s.forceInputMode).length).toBe(0);
  });
});

describe("約束2: 絞りは科目ごとに通す", () => {
  test("優先度の絞り7通りとも246枠になる (素で当てると21枠まで落ちる)", () => {
    const b = H.load(DATA["ap-kamoku-b"]);
    const combos = [[1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]];
    const naive = [];
    combos.forEach((pr) => {
      const st = Object.assign({}, H.BASE_SETTINGS, { priorities: pr });
      expect(b.buildMixedPoolFrom(st, SOURCES()).length).toBe(246);
      let n = 0;
      SOURCES().forEach((src) => { n += b.buildPoolFrom(st, src).length; });
      naive.push(n);
    });
    // 素で当てた側は現に揺れる (この行が無いと、上の 246 が何も測っていない形でも通る)
    expect(Math.min.apply(null, naive)).toBe(21);
    expect(Math.max.apply(null, naive)).toBe(246);
  });

  test("どの科目も持たない分野を渡しても、1科目も0問にならない", () => {
    const b = H.load(DATA["ap-kamoku-b"]);
    const st = Object.assign({}, H.BASE_SETTINGS, { categories: ["tcode"] });
    expect(b.buildMixedPoolFrom(st, SOURCES()).length).toBe(246);
    let n = 0;
    SOURCES().forEach((src) => { n += b.buildPoolFrom(st, src).length; });
    expect(n).toBe(0);
  });

  test("未習得だけ、は科目ごとの成績で効く", () => {
    const b = H.load(DATA["ap-kamoku-b"]);
    const done = new Set(DATA["fe-kamoku-b"].slice(0, 40).map((q) => q.id));
    const srcs = H.LOCAL_IDS.map((id) =>
      H.source(id, DATA[id], { choiceMastered: id === "fe-kamoku-b" ? done : new Set() })
    );
    const st = Object.assign({}, H.BASE_SETTINGS, { poolMode: "unmastered" });
    const slots = b.buildMixedPoolFrom(st, srcs);
    expect(slots.length).toBe(206);
    expect(slots.filter((s) => s.subjectId === "fe-kamoku-b").length).toBe(60);
    expect(slots.filter((s) => s.subjectId === "ap-kamoku-b").length).toBe(100);
  });
});
