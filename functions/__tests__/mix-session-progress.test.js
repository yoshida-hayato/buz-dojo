//
// ミックス出題 第3段: 読み込みの進み具合と、出てくる集合の形。
// 直列に読むことと落ちた1本を飛ばすことは mix-session-collect が見る。
//
const H = require("../test-helpers/mix-session-sandbox.js");

const ROWS = { a: 5, b: 7, c: 3 };

function run(ids, rows, opts) {
  const o = opts || {};
  const M = H.load();
  const loader = H.fakeLoader(rows === undefined ? ROWS : rows, o.delayMs);
  const sets = H.fakeSets(o.sets);
  const rec = H.recorder();
  return M.collectSources(ids, {
    loadSubjectData: o.noLoader ? null : loader,
    selectionSetsFor: o.noSets ? null : sets,
    onProgress: rec,
  }).then((out) => ({ out: out, loader: loader, sets: sets, rec: rec }));
}

describe("1本ごとに進み具合を返す", () => {
  test("読む前と読んだ後の両方を返し、最後に done が来る", async () => {
    const r = await run(["a", "b"]);
    expect(r.rec.phases()).toBe("loading loaded loading loaded done");
  });

  test("落ちた本は failed として返る", async () => {
    const r = await run(["a", "b"], { a: 5, b: "だめ" });
    expect(r.rec.phases()).toBe("loading loaded loading failed done");
  });

  test("done は何本中何本かを持つ", async () => {
    const r = await run(["a", "b", "c"], { a: 5, b: "だめ", c: 3 });
    const last = r.rec.events[r.rec.events.length - 1];
    expect(last.total).toBe(3);
    expect(last.loaded).toBe(2);
    expect(last.failed).toBe(1);
  });

  test("読み終えた本の数は1本ずつ増える", async () => {
    const r = await run(["a", "b", "c"]);
    const done = r.rec.events
      .filter((e) => e.phase === "loaded")
      .map((e) => e.done + "/" + e.total);
    expect(done.join(" ")).toBe("1/3 2/3 3/3");
  });

  test("読めた本は問題数も返す", async () => {
    const r = await run(["b"]);
    expect(r.rec.events[1].count).toBe(7);
  });

  test("進み具合の受け手が無くても落ちない", async () => {
    const M = H.load();
    const out = await M.collectSources(["a"], {
      loadSubjectData: H.fakeLoader(ROWS),
      selectionSetsFor: H.fakeSets({}),
    });
    expect(out.sources.length).toBe(1);
  });
});

describe("出てくる集合は buildMixedPoolFrom がそのまま受ける形である", () => {
  test("4つの集合が科目ごとに入る", async () => {
    const r = await run(["a"], ROWS, {
      sets: { a: { choiceMastered: ["a-1"], wrongIds: ["a-2", "a-3"] } },
    });
    const s = r.out.sources[0];
    expect(s.choiceMastered.has("a-1")).toBe(true);
    expect(s.wrongIds.size).toBe(2);
    expect(s.answeredIds.size).toBe(0);
    expect(s.inputMastered.size).toBe(0);
    expect(r.sets.seen.join(" ")).toBe("a");
  });

  test("成績の口が無くても、空の集合で組める", async () => {
    const r = await run(["a"], ROWS, { noSets: true });
    expect(r.out.sources[0].wrongIds.size).toBe(0);
    expect(r.out.sources[0].entries.length).toBe(5);
  });

  test("集合を聞く科目は、読んだ科目と同じである", async () => {
    const r = await run(["a", "b", "c"], { a: 5, b: "だめ", c: 3 });
    expect(r.sets.seen.join(" ")).toBe("a c");
  });
});
