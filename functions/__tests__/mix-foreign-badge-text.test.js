//
// ミックス出題 第3段: 他科目の問題の札の中身 (MixUI.foreignBadges)。
// 開いている科目の問題を触らないことは mix-foreign-badge が見る。
//
// 2026-11-15 に本物の Chromium で実測した。科目B を開いたまま sap の問題を
// 1問流すと、直す前の札は tcode と 最優先 の2つで、素の分野キーが
// そのまま画面に出ていた。直した後は SAP と 最優先 である。
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

describe("他科目の問題は、読めない分野キーを科目の題に替える", () => {
  test("分野キーが開いている科目の表に無ければ、科目の題と優先度だけ", () => {
    const M = H.load();
    const out = M.foreignBadges(q("sap", "tcode", 1), CTX);
    expect(out.length).toBe(2);
    expect(out[0].kind).toBe("subject");
    expect(out[0].text).toBe("SAP");
    expect(out[1].kind).toBe("priority");
    expect(out[1].text).toBe("★★★ 最優先");
    expect(out[1].priority).toBe(1);
    // 素の分野キーは1つも出ない
    expect(out.filter((b) => b.text === "tcode").length).toBe(0);
  });

  test("分野キーが表に在れば、分野の札も足す", () => {
    const M = H.load();
    const out = M.foreignBadges(q("ap-kamoku-b", "scenario", 2), CTX);
    expect(out.length).toBe(3);
    expect(out[0].text).toBe("応用情報B");
    expect(out[1].kind).toBe("category");
    expect(out[1].text).toBe("シナリオ");
    expect(out[2].text).toBe("★★ 重要");
  });

  test("科目の題が引けなければ、科目 id をそのまま出す", () => {
    const M = H.load();
    const out = M.foreignBadges(q("teams-collab", "tcode", 1), CTX);
    expect(out[0].text).toBe("teams-collab");
  });

  test("題を引く口が無くても、科目 id を出す", () => {
    const M = H.load();
    const ctx = Object.assign({}, CTX, { titleOf: null });
    expect(M.foreignBadges(q("sap", "tcode", 1), ctx)[0].text).toBe("sap");
  });

  test("優先度が表に無ければ、その札は出さない", () => {
    const M = H.load();
    const out = M.foreignBadges(q("sap", "tcode", 9), CTX);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe("subject");
  });

  test("分野も優先度も無い問題でも、科目の題だけは出る", () => {
    const M = H.load();
    const out = M.foreignBadges({ subjectId: "sap", entry: {} }, CTX);
    expect(out.length).toBe(1);
    expect(out[0].text).toBe("SAP");
  });

  test("分野の表が空でも落ちない", () => {
    const M = H.load();
    const ctx = Object.assign({}, CTX, { categories: null, priorities: null });
    const out = M.foreignBadges(q("sap", "scenario", 1), ctx);
    expect(out.length).toBe(1);
  });

  test("継承した名前の分野キーは、表に在るとみなさない", () => {
    const M = H.load();
    const out = M.foreignBadges(q("sap", "toString", 1), CTX);
    expect(out.length).toBe(2);
    expect(out[1].kind).toBe("priority");
  });
});
