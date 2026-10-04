// 「無料かどうか」も、ボタンに出る金額と同じ出どころから決まることのガード。
//
// 無料のしきい値は 100問以下 (config/pricing.js の priceForQuestionCount)。
// 2026-10-04 の 20:48便 は getSubjectPriceYen を catalog.js 優先に直したが、
// isFreeSubject は静的な問題数だけを見る P.isSubjectFree を先に見ていたため、
// 静的値が100以下・catalog.js が100超の間だけ「画面に金額が出ているのに、
// 無制限で無料」になった。outlook-mail は実データ100・静的100 なので、
// master 側で1問増えた瞬間に踏む経路だった。
//
// 画面側は素のスクリプトなので vm で評価する (price-source-consistency と同型)。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ENTITLEMENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const FREE_LIMIT = 100;

// liveCounts = catalog.js 側の件数。staticCounts = 静的値の差し替え
function loadEntitlement(opts) {
  const o = opts || {};
  const live = o.liveCounts || {};
  const staticCatalog = JSON.parse(JSON.stringify(pricing.SUBJECT_CATALOG));
  Object.keys(o.staticCounts || {}).forEach((id) => {
    if (staticCatalog[id]) staticCatalog[id].questionCount = o.staticCounts[id];
  });
  const P = Object.assign({}, pricing, { SUBJECT_CATALOG: staticCatalog });
  P.getSubjectPriceYen = function (id) {
    const meta = staticCatalog[id];
    if (!meta) return null;
    return pricing.priceForQuestionCount(meta.questionCount);
  };
  P.isSubjectFree = function (id) {
    return P.getSubjectPriceYen(id) === 0;
  };
  const ctx = {
    console,
    PricingConfig: P,
    SubjectCatalog: {
      getQuestionCountSync(id) {
        return typeof live[id] === "number" ? live[id] : 0;
      },
    },
    CURRENT_SUBJECT: o.openSubject ? { id: o.openSubject } : null,
    QUIZ_DATA: new Array(o.quizLength || 0).fill({}),
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  vm.createContext(ctx);
  const src =
    fs.readFileSync(ENTITLEMENT_SRC, "utf8") + "\n;globalThis.__E = Entitlement;";
  vm.runInContext(src, ctx);
  return ctx.__E;
}

const ID = "outlook-mail";

describe("無料判定は静的な問題数で短絡しない", () => {
  test("静的100・catalog 101 なら有料。金額とロックが一致する", () => {
    const ent = loadEntitlement({
      staticCounts: { [ID]: FREE_LIMIT },
      liveCounts: { [ID]: FREE_LIMIT + 1 },
    });
    expect(ent.getSubjectPriceYen(ID)).toBe(
      pricing.priceForQuestionCount(FREE_LIMIT + 1)
    );
    expect(ent.isFreeSubject(ID)).toBe(false);
    expect(ent.hasAccess(ID)).toBe(false);
  });

  test("開いている科目でも同じ。QUIZ_DATA.length は効かない", () => {
    const ent = loadEntitlement({
      staticCounts: { [ID]: FREE_LIMIT },
      liveCounts: { [ID]: FREE_LIMIT + 1 },
      openSubject: ID,
      quizLength: 4,
    });
    expect(ent.isFreeSubject(ID)).toBe(false);
    expect(ent.hasAccess(ID)).toBe(false);
  });

  test("静的400・catalog 100 なら無料。catalog を優先する向きも効く", () => {
    const ent = loadEntitlement({
      staticCounts: { [ID]: 400 },
      liveCounts: { [ID]: FREE_LIMIT },
    });
    expect(ent.getSubjectPriceYen(ID)).toBe(0);
    expect(ent.isFreeSubject(ID)).toBe(true);
    expect(ent.hasAccess(ID)).toBe(true);
  });

  test("しきい値のちょうど上 (catalog 100) は無料のまま", () => {
    const ent = loadEntitlement({
      staticCounts: { [ID]: FREE_LIMIT },
      liveCounts: { [ID]: FREE_LIMIT },
    });
    expect(ent.isFreeSubject(ID)).toBe(true);
    expect(ent.hasAccess(ID)).toBe(true);
  });

  test("知らない科目は無料に倒れない (ロックのまま)", () => {
    const ent = loadEntitlement({ liveCounts: {} });
    expect(ent.getSubjectPriceYen("no-such-subject")).toBeNull();
    expect(ent.isFreeSubject("no-such-subject")).toBe(false);
    expect(ent.hasAccess("no-such-subject")).toBe(false);
  });

  test("subjectId が空なら無料ではない", () => {
    const ent = loadEntitlement({ liveCounts: {} });
    expect(ent.isFreeSubject("")).toBe(false);
    expect(ent.isFreeSubject(null)).toBe(false);
  });

  test("公式の catalog で現に無料・有料の向きが変わっていない", () => {
    const ent = loadEntitlement({
      liveCounts: Object.keys(pricing.SUBJECT_CATALOG).reduce((acc, id) => {
        acc[id] = pricing.SUBJECT_CATALOG[id].questionCount;
        return acc;
      }, {}),
    });
    Object.keys(pricing.SUBJECT_CATALOG).forEach((id) => {
      const n = pricing.SUBJECT_CATALOG[id].questionCount;
      expect(ent.isFreeSubject(id)).toBe(n <= FREE_LIMIT);
    });
  });
});
