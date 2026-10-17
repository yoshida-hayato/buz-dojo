// 無料枠切れの壁で、パックの金額も名乗ることのガード。
//
// この案内は長いあいだ「単品 1,980円、またはプレミアムパックで続きを学習
// できます」と書いていた。単品にだけ値段が付き、隣の高い方は名前だけで、
// 壁に当たった人が比べる材料が片方にしか無かった。
//
// 金額は PACK_PLAN.priceYen から出す。字面で書くと CHECKOUT_MODE を
// 切り替えたときに食い違う (price-source と同じ理由)。
// ボタンの見える字には入れない (buy-button-label のガードの理由。
// 幅 360 の端末で語の途中から2行に割れる)。aria-label には残す。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const SCREENS_SRC = path.join(__dirname, "..", "..", "js", "screens-subjects.js");
const PAID = "windows-shortcuts";
const PAID_COUNT = 400;
const FREE = "ai-ontology-intro";
const PACK_WORD = "プレミアムパック";

function fakeEl() {
  const attrs = {};
  return {
    textContent: "",
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    scrollIntoView() {},
    focus() {},
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    getAttribute(k) {
      return k in attrs ? attrs[k] : null;
    },
  };
}

function loadScreens(o) {
  const els = {};
  const ctx = {
    console,
    CURRENT_SUBJECT: o.openSubject ? { id: o.openSubject } : null,
    $: (id) => (els[id] = els[id] || fakeEl()),
    window: { setTimeout() {} },
    localStorage: { getItem: () => null, setItem() {} },
    QUIZ_DATA: new Array(o.quizLength || 0).fill({}),
    SubjectCatalog: {
      getQuestionCountSync: (id) =>
        o.counts && typeof o.counts[id] === "number" ? o.counts[id] : 0,
    },
  };
  if (!o.noPricing) ctx.PricingConfig = pricing;
  if (!o.noPack) {
    ctx.PACK_PLAN = {
      id: "all",
      title: PACK_WORD,
      priceYen: o.noPricing ? 1980 : pricing.PACK_PRICE_YEN,
    };
  }
  vm.createContext(ctx);
  const NL = String.fromCharCode(10);
  vm.runInContext(
    [fs.readFileSync(ENT_SRC, "utf8"), ";globalThis.Entitlement = Entitlement;"].join(NL),
    ctx
  );
  vm.runInContext(fs.readFileSync(SCREENS_SRC, "utf8"), ctx);
  return {
    ctx,
    gate: () => (els["start-quota-gate-text"] || {}).textContent || "",
    packBtn: () => els["start-quota-buy-pack-btn"] || null,
  };
}

function paid(extra) {
  return Object.assign(
    { counts: { [PAID]: PAID_COUNT }, openSubject: PAID, quizLength: PAID_COUNT },
    extra
  );
}

describe("壁の案内に、単品とパックの両方の金額が出る", () => {
  test("パックの金額が案内の本文に入る", () => {
    const s = loadScreens(paid());
    s.ctx.showFreeQuotaExhaustedAtStart();
    const packLabel = s.ctx.Entitlement.formatPrice(pricing.PACK_PRICE_YEN);
    expect(s.gate()).toContain(PACK_WORD + " " + packLabel);
    expect(s.gate()).toContain("使い切りました");
  });

  test("金額は pricing の宣言から出る (字面で書いていない)", () => {
    const src = fs.readFileSync(SCREENS_SRC, "utf8");
    const from = src.indexOf("const packYen =");
    expect(from).toBeGreaterThan(0);
    expect(src.slice(from, from + 400)).toContain("PACK_PLAN");
    expect(src.slice(from, from + 400)).toContain("PricingConfig");
  });

  test("何度描き直しても金額は1つだけ", () => {
    const s = loadScreens(paid());
    s.ctx.showFreeQuotaExhaustedAtStart();
    s.ctx.showFreeQuotaExhaustedAtStart();
    s.ctx.showFreeQuotaExhaustedAtStart();
    const packLabel = s.ctx.Entitlement.formatPrice(pricing.PACK_PRICE_YEN);
    expect(s.gate().split(packLabel).length - 1).toBe(1);
  });

  test("ボタンの見える字は増やさず、金額は aria-label に残る", () => {
    const s = loadScreens(paid());
    s.ctx.showFreeQuotaExhaustedAtStart();
    const btn = s.packBtn();
    expect(btn.textContent).toBe("");
    const aria = btn.getAttribute("aria-label");
    expect(aria).toContain(PACK_WORD);
    expect(aria).toContain(String(pricing.PACK_PRICE_YEN.toLocaleString("ja-JP")));
  });
});

describe("金額を約束できないときは黙る", () => {
  test("PACK_PLAN が無い場では何も足さない", () => {
    const s = loadScreens(paid({ noPack: true }));
    s.ctx.showFreeQuotaExhaustedAtStart();
    expect(s.gate()).toContain(PACK_WORD + "で");
    expect(s.packBtn().getAttribute("aria-label")).toBe(null);
  });

  test("PricingConfig が無い場では既定値を名乗らない", () => {
    const s = loadScreens(paid({ noPricing: true }));
    s.ctx.showFreeQuotaExhaustedAtStart();
    expect(s.gate()).toContain(PACK_WORD + "で");
    expect(s.gate()).not.toContain("1,980");
    expect(s.packBtn().getAttribute("aria-label")).toBe(null);
  });

  test("無料科目では足さない", () => {
    const s = loadScreens({ counts: { [FREE]: 60 }, openSubject: FREE, quizLength: 60 });
    s.ctx.updateStartQuotaGate(true, s.ctx.Entitlement.formatPrice(0));
    expect(s.gate()).not.toContain("3,980");
    expect(s.packBtn().getAttribute("aria-label")).toBe(null);
  });
});
