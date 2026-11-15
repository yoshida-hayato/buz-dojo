//
// ミックス出題 第3段: 他科目から来た問題の札 (MixUI.foreignBadges)。
//
// なぜ要るか (2026-11-15 に本物の Chromium で実測)。分野の表 (CATEGORIES) は
// 開いている科目のものしか無い。科目B を開いたまま sap の問題を1問流すと、
// 札は tcode と 最優先 の2つになり、素の分野キーがそのまま画面に出た。
// しかも、どの科目の問題かは画面のどこにも出ていなかった。混ぜたときに
// いちばん知りたいのはそこである。
//
// 直した後の実測は SAP と 最優先 の2つ。開いている科目の問題は札が
// 1文字も変わらない (シナリオ と 重要)。
//
const H = require("../test-helpers/mix-ui-sandbox.js");

const CTX = {
  currentId: "fe-kamoku-b",
  categories: { scenario: "シナリオ" },
  priorities: { 1: "★★★ 最優先", 2: "★★ 重要" },
  titleOf: (id) => (id === "sap" ? "SAP" : id === "ap-kamoku-b" ? "応用情報B" : ""),
};

function q(subjectId, category, priority) {
  return { subjectId: subjectId, entry: { id: "x", category: category, priority: priority } };
}

describe("開いている科目の問題は、札を1つも触らない", () => {
  test("同じ科目なら null を返す (呼び元が従来どおり描く)", () => {
    const M = H.load();
    expect(M.foreignBadges(q("fe-kamoku-b", "scenario", 1), CTX)).toBe(null);
  });

  test("科目が分からない問題も null を返す", () => {
    const M = H.load();
    expect(M.foreignBadges(q("", "scenario", 1), CTX)).toBe(null);
    expect(M.foreignBadges(null, CTX)).toBe(null);
  });

  test("開いている科目が分からなければ null を返す", () => {
    const M = H.load();
    const ctx = Object.assign({}, CTX, { currentId: "" });
    expect(M.foreignBadges(q("sap", "tcode", 1), ctx)).toBe(null);
    expect(M.foreignBadges(q("sap", "tcode", 1), null)).toBe(null);
  });
});
