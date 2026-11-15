//
// ミックス出題 第3段: 選んだ科目の分量の合計 (MixUI.selectionSummary)。
// 一覧の札と状態は mix-ui-list が見る。
//
// 読み込む量の実測 (2026-11-15)。自前の3科目は 1問あたり 1,303 から
// 2,345バイト で、13科目の問題数の合計は 7,862問 である。つまり全科目を
// 素で読むと 9.8MB から 17.6MB になる。sap だけで 4,951問 = 全体の
// 63パーセントを占めるので、重さの境目は sap を外せば下回る水準に置く。
//
const H = require("../test-helpers/mix-ui-sandbox.js");

describe("選んだ分量の合計", () => {
  const LIST = [
    { id: "a", count: 4951 },
    { id: "b", count: 100 },
    { id: "c", count: 46 },
  ];

  test("選ばれた科目の問題数だけを足す", () => {
    const M = H.load();
    const s = M.selectionSummary(LIST, ["b", "c"]);
    expect(s.subjects).toBe(2);
    expect(s.questions).toBe(146);
    expect(s.heavy).toBe(false);
  });

  test("大きい科目が入ると、重い側に倒れる", () => {
    const M = H.load();
    const s = M.selectionSummary(LIST, ["a", "b"]);
    expect(s.questions).toBe(5051);
    expect(s.heavy).toBe(true);
  });

  test("境目は、大きい科目を外せば下回る水準に在る", () => {
    const M = H.load();
    expect(M.HEAVY_QUESTION_COUNT).toBe(2000);
    const all = M.selectionSummary(LIST, ["a", "b", "c"]);
    const noBig = M.selectionSummary(LIST, ["b", "c"]);
    expect(all.heavy).toBe(true);
    expect(noBig.heavy).toBe(false);
  });

  test("一覧に無い科目を選んでも数えない", () => {
    const M = H.load();
    const s = M.selectionSummary(LIST, ["b", "no-such"]);
    expect(s.subjects).toBe(1);
    expect(s.questions).toBe(100);
  });

  test("何も選ばなければ0になる", () => {
    const M = H.load();
    const s = M.selectionSummary(LIST, []);
    expect(s.subjects).toBe(0);
    expect(s.questions).toBe(0);
    expect(M.selectionSummary(null, null).subjects).toBe(0);
  });
});
