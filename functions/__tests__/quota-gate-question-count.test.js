// 無料枠切れの案内が「買うと何が変わるか」を名乗ることのガード。
//
// 15:48便まで、この文面は金額とパックの存在しか書いていなかった。その金額で
// 何問が開くのか、1日20問の上限がどうなるのかは一度も無い。1,000問を無料で
// 開けている問題集と並ぶ申込窓では、「続きを学習できます」は何も約束しない。
//
// ただし件数は嘘になりやすい。読込済みの QUIZ_DATA.length は科目切替中・
// 部分読込・古いキャッシュで catalog より少なくなる。それを名乗ると、金額の
// ときと同じ壊れ方 (quota-gate-price-source) を件数で繰り返す。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ENTITLEMENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const SCREENS_SRC = path.join(__dirname, "..", "..", "js", "screens-subjects.js");
const PAID = "windows-shortcuts";
const PAID_COUNT = 400;
const FREE = "ai-ontology-intro";

function fakeEl() {
  return {
    textContent: "",
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    scrollIntoView() {},
    focus() {},
  };
}

function loadScreens(o) {
  const live = o.liveCounts || {};
  const els = {};
  const ctx = {
    console,
    PricingConfig: pricing,
    CURRENT_SUBJECT: o.openSubject ? { id: o.openSubject } : null,
    $: (id) => (els[id] = els[id] || fakeEl()),
    window: { setTimeout() {} },
    localStorage: { getItem: () => null, setItem() {} },
  };
  if (!o.noCatalog) {
    ctx.SubjectCatalog = {
      getQuestionCountSync: (id) => (typeof live[id] === "number" ? live[id] : 0),
    };
  }
  if (!o.quizUndefined) ctx.QUIZ_DATA = new Array(o.quizLength || 0).fill({});
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(ENTITLEMENT_SRC, "utf8") + "\n;globalThis.Entitlement = Entitlement;",
    ctx
  );
  vm.runInContext(fs.readFileSync(SCREENS_SRC, "utf8"), ctx);
  return {
    ent: ctx.Entitlement,
    gate: ctx.updateStartQuotaGate,
    atStart: ctx.showFreeQuotaExhaustedAtStart,
    text: () => (els["start-quota-gate-text"] || {}).textContent || "",
  };
}

function paid(extra) {
  return Object.assign({ liveCounts: { [PAID]: PAID_COUNT }, openSubject: PAID }, extra);
}

const WHOLE = "全" + PAID_COUNT + "問";

describe("買うと何が変わるかを名乗る", () => {
  test("catalog の件数と、1日の上限が消えることを書く", () => {
    const s = loadScreens(paid({ quizLength: PAID_COUNT }));
    s.gate(true);
    expect(s.text()).toContain(WHOLE);
    expect(s.text()).toContain("1日の上限なく");
    expect(s.text()).toContain(s.ent.formatPrice(s.ent.getSubjectPriceYen(PAID)));
    expect(s.text()).toContain("プレミアムパック");
  });

  test("何度描き直しても1文しか足さない", () => {
    const s = loadScreens(paid({ quizLength: PAID_COUNT }));
    s.gate(true);
    s.gate(true);
    s.gate(true);
    expect(s.text().split(WHOLE).length - 1).toBe(1);
  });

  test("開始押下時の案内でも同じ1文が出る", () => {
    const s = loadScreens(paid({ quizLength: PAID_COUNT }));
    s.atStart();
    expect(s.text()).toContain(WHOLE);
    expect(s.text()).toContain("1日の上限なく");
  });
});

describe("名乗る件数は catalog から出る", () => {
  test("読込済みが catalog より少ない / 0 / undefined でも catalog を見る", () => {
    for (const o of [{ quizLength: 120 }, { quizLength: 0 }, { quizUndefined: true }]) {
      const s = loadScreens(paid(o));
      s.gate(true);
      expect(s.text()).toContain(WHOLE);
      expect(s.text()).not.toContain("全120問");
      expect(s.text()).not.toContain("全0問");
    }
  });

  test("catalog が読めないときは件数を名乗らず、前の文面のまま", () => {
    const s = loadScreens({ openSubject: PAID, quizLength: PAID_COUNT, noCatalog: true });
    s.gate(true);
    expect(s.text()).not.toContain("全");
    expect(s.text()).toContain("続きを学習できます");
  });

  test("件数の出どころは SubjectCatalog だけである", () => {
    const src = fs.readFileSync(SCREENS_SRC, "utf8");
    const from = src.indexOf("function updateStartQuotaGate");
    const to = src.indexOf("function showFreeQuotaExhaustedAtStart");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    expect(src.slice(from, to)).toContain("SubjectCatalog.getQuestionCountSync(");
  });
});

describe("無料科目と未選択では購入の約束をしない", () => {
  test("無料科目 (0円) では「上限なく解ける」と書かない", () => {
    const s = loadScreens({ liveCounts: { [FREE]: 60 }, openSubject: FREE, quizLength: 60 });
    expect(s.ent.getSubjectPriceYen(FREE)).toBe(0);
    s.gate(true);
    expect(s.text()).not.toContain("1日の上限なく");
  });

  test("科目が開いていないときは件数を名乗らない", () => {
    const s = loadScreens({ liveCounts: { [PAID]: PAID_COUNT }, quizUndefined: true });
    s.gate(true);
    expect(s.text()).not.toContain(WHOLE);
  });
});
