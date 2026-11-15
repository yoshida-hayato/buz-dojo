//
// ミックス出題 第3段: 選ばれた科目を順に読む所 (MixSession.collectSources)。
//
// 約束は4つ。1本ずつ読むこと、頼んだ順に並ぶこと、読めなかった1本で
// ミックスそのものが止まらないこと、1本ごとに進み具合を返すこと。
//
// 「1本ずつ」は字面では見ない。偽の読み口が同時に走った本数を自分で数え、
// その最大が1であることで見る (失敗の型7。語が在るかで見張ると、
// Promise.all に書き替える壊し方が素通りする)。
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

describe("1本ずつ読む", () => {
  test("同時に走るのは常に1本だけ", async () => {
    const r = await run(["a", "b", "c"], ROWS, { delayMs: 5 });
    expect(r.loader.state.maxInFlight).toBe(1);
    expect(r.loader.state.calls.length).toBe(3);
  });

  test("読む順は頼んだ順である", async () => {
    const r = await run(["c", "a", "b"]);
    expect(r.loader.state.calls.join(" ")).toBe("c a b");
    expect(r.out.sources.map((s) => s.subjectId).join(" ")).toBe("c a b");
  });

  test("同じ科目を2度頼んでも1度しか読まない", async () => {
    const r = await run(["a", "b", "a", "a"]);
    expect(r.loader.state.calls.join(" ")).toBe("a b");
    expect(r.out.sources.length).toBe(2);
  });

  test("空の名前は読みに行かない", async () => {
    const r = await run(["", null, undefined, "a"]);
    expect(r.loader.state.calls.join(" ")).toBe("a");
  });
});

describe("読めなかった1本で止まらない", () => {
  test("途中の1本が落ちても、残りは読む", async () => {
    const r = await run(["a", "b", "c"], { a: 5, b: "頁が返りました", c: 3 });
    expect(r.out.sources.map((s) => s.subjectId).join(" ")).toBe("a c");
    expect(r.out.failed.length).toBe(1);
    expect(r.out.failed[0].subjectId).toBe("b");
    expect(r.out.failed[0].message).toBe("頁が返りました");
  });

  test("一覧に無い科目も、落ちた側に入るだけである", async () => {
    const r = await run(["a", "no-such"], ROWS);
    expect(r.out.sources.length).toBe(1);
    expect(r.out.failed[0].subjectId).toBe("no-such");
  });

  test("問題が0件の科目は、読めた扱いにしない", async () => {
    const r = await run(["a", "b"], { a: 5, b: 0 });
    expect(r.out.sources.map((s) => s.subjectId).join(" ")).toBe("a");
    expect(r.out.failed[0].message).toBe("問題が0件です");
  });

  test("全部落ちても投げない", async () => {
    const r = await run(["x", "y"], {});
    expect(r.out.sources.length).toBe(0);
    expect(r.out.failed.length).toBe(2);
  });

  test("読む口が無ければ、全部落ちた側に入る", async () => {
    const r = await run(["a", "b"], ROWS, { noLoader: true });
    expect(r.out.sources.length).toBe(0);
    expect(r.out.failed.length).toBe(2);
    expect(r.out.failed[0].message).toBe("科目を読む口がありません");
  });
});
