// ペイウォールの文面が3箇所で同じことを言うことのガード。
//
// 15:48便は「買うと全何問が、1日の上限なく解けるか」を開始位置の案内にだけ
// 足し、ホームのカードの文面 (plan-paywall-text) は2箇所とも古いままだった。
// 件数の出どころは catalog に揃える。読込済みの QUIZ_DATA.length は科目
// 切替中・部分読込・古いキャッシュで catalog より少なくなり、それを名乗ると
// 金額のときと同じ壊れ方 (quota-gate-price-source) を件数で繰り返す。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const SCREENS_SRC = path.join(__dirname, "..", "..", "js", "screens-subjects.js");
const PAID = "windows-shortcuts";
const PAID_COUNT = 400;
const FREE = "ai-ontology-intro";
const WHOLE = "全" + PAID_COUNT + "問";
const RESET = "翌日になると";

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
  const NL = String.fromCharCode(10);
  vm.runInContext(
    [fs.readFileSync(ENT_SRC, "utf8"), ";globalThis.Entitlement = Entitlement;"].join(NL),
    ctx
  );
  vm.runInContext(fs.readFileSync(SCREENS_SRC, "utf8"), ctx);
  return {
    ent: ctx.Entitlement,
    append: ctx.appendPaywallWholeSentence,
    atStart: ctx.showFreeQuotaExhaustedAtStart,
    el: () => fakeEl(),
    text: () => (els["plan-paywall-text"] || {}).textContent || "",
  };
}

function paidOpen(extra) {
  return Object.assign({ liveCounts: { [PAID]: PAID_COUNT }, openSubject: PAID }, extra);
}

describe("ホームのカードの文面も件数と上限を名乗る", () => {
  test("開始押下時の案内で1文が入り、翌日の節より前に置かれる", () => {
    const s = loadScreens(paidOpen({ quizLength: PAID_COUNT }));
    s.atStart();
    const t = s.text();
    expect(t).toContain(WHOLE);
    expect(t).toContain("1日の上限なく");
    expect(t).toContain("使い切りました");
    expect(t.indexOf(WHOLE)).toBeLessThan(t.indexOf(RESET));
  });

  test("何度描き直しても1文しか足さない", () => {
    const s = loadScreens(paidOpen({ quizLength: PAID_COUNT }));
    s.atStart();
    s.atStart();
    s.atStart();
    expect(s.text().split(WHOLE).length - 1).toBe(1);
  });

  test("ホームのカード側 (updateHomeNote) も同じ関数を通している", () => {
    const src = fs.readFileSync(SCREENS_SRC, "utf8");
    const from = src.indexOf("function updateHomeNote");
    const to = src.indexOf("function isFreeQuotaExhausted");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    expect(src.slice(from, to)).toContain("appendPaywallWholeSentence(paywallText");
  });
});

describe("件数は catalog から出て、約束できないときは黙る", () => {
  test("読込済みが catalog より少なくても catalog を見る", () => {
    const s = loadScreens(paidOpen({ quizLength: 120 }));
    const el = s.el();
    s.append(el, s.ent.formatPrice(s.ent.getSubjectPriceYen(PAID)));
    expect(el.textContent).toContain(WHOLE);
    expect(el.textContent).not.toContain("全120問");
  });

  test("catalog が読めないときは足さない", () => {
    const s = loadScreens({ openSubject: PAID, quizLength: PAID_COUNT, noCatalog: true });
    const el = s.el();
    s.append(el, s.ent.formatPrice(s.ent.getSubjectPriceYen(PAID)));
    expect(el.textContent).toBe("");
  });

  test("無料科目 (0円) と、金額ラベルが空のときは足さない", () => {
    const f = loadScreens({ liveCounts: { [FREE]: 60 }, openSubject: FREE, quizLength: 60 });
    expect(f.ent.getSubjectPriceYen(FREE)).toBe(0);
    const a = f.el();
    f.append(a, f.ent.formatPrice(0));
    expect(a.textContent).toBe("");
    const s = loadScreens(paidOpen({ quizLength: PAID_COUNT }));
    const b = s.el();
    s.append(b, "");
    expect(b.textContent).toBe("");
  });

  test("科目が開いていないときは足さない", () => {
    const s = loadScreens({ liveCounts: { [PAID]: PAID_COUNT }, quizUndefined: true });
    const el = s.el();
    s.append(el, "980円");
    expect(el.textContent).toBe("");
  });
});
