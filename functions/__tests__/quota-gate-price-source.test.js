// 無料枠切れの案内 (ペイウォールの文面と購入ボタン) に出る金額が、
// 請求と同じ出どころから出ることのガード。
//
// 2026-10-04〜05 の4便で、金額の出どころを catalog.js 優先に寄せてきた。
// 残っていたのは js/screens-subjects.js の updateStartQuotaGate と
// showFreeQuotaExhaustedAtStart で、どちらも subjectPriceYenForUi を通らず、
// Entitlement.priceForQuestionCount(QUIZ_DATA.length) を直に呼んでいた。
//
// 読込済みの件数は、科目切替の最中 (clearGlobals で QUIZ_DATA が undefined)、
// 部分読込、ブラウザのキャッシュが古い間、catalog より少なくなる。
// priceForQuestionCount(0) は 0 で、formatPrice(0) は「無料」。
// 有料科目を止めているペイウォールが「単品 無料」と書き、購入ボタンが
// 「この問題集を購入（無料）」になる。止めながら無料と名乗る文面になる。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ENTITLEMENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const SCREENS_SRC = path.join(__dirname, "..", "..", "js", "screens-subjects.js");
const PAID = "windows-shortcuts";
const PAID_COUNT = 400;
const FREE = "ai-ontology-intro";
const FREE_COUNT = 60;

function fakeEl() {
  return {
    textContent: "",
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    scrollIntoView() {},
    focus() {},
  };
}

// 画面側を評価する。liveCounts = catalog.js 側の件数、
// quizLength = 読込済みの QUIZ_DATA の件数、
// quizUndefined = 科目切替の最中 (QUIZ_DATA が undefined)
function loadScreens(opts) {
  const o = opts || {};
  const live = o.liveCounts || {};
  const els = {};
  const ctx = {
    console,
    PricingConfig: pricing,
    SubjectCatalog: {
      getQuestionCountSync: (id) => (typeof live[id] === "number" ? live[id] : 0),
    },
    CURRENT_SUBJECT: o.openSubject ? { id: o.openSubject } : null,
    $: (id) => (els[id] = els[id] || fakeEl()),
    window: { setTimeout() {} },
    localStorage: { getItem: () => null, setItem() {} },
  };
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
    buyLabel: () => (els["start-quota-buy-subject-btn"] || {}).textContent || "",
    paywall: () => (els["plan-paywall-text"] || {}).textContent || "",
  };
}

// 有料科目を開いた状態。catalog は PAID_COUNT 件
function paid(extra) {
  return Object.assign({ liveCounts: { [PAID]: PAID_COUNT }, openSubject: PAID }, extra);
}

const PAID_LABEL = (() => {
  const yen = pricing.priceForQuestionCount(PAID_COUNT);
  const suffix = pricing.CHECKOUT_MODE === "payment" ? "（買い切り）" : "/月";
  return "¥" + yen.toLocaleString("ja-JP") + suffix;
})();

describe("無料枠切れの案内の金額は、読込済みの件数ではなく catalog から出る", () => {
  test("科目切替中 (QUIZ_DATA が undefined) でも「単品 無料」と書かない", () => {
    const s = loadScreens(paid({ quizUndefined: true }));
    s.gate(true);
    expect(s.text()).toContain(PAID_LABEL);
    expect(s.text()).not.toContain("単品 無料");
  });

  test("科目切替中でも購入ボタンが「購入（無料）」にならない", () => {
    const s = loadScreens(paid({ quizUndefined: true }));
    s.gate(true);
    expect(s.buyLabel()).toContain(PAID_LABEL);
    expect(s.buyLabel()).not.toContain("無料");
  });

  test("読込済みが 0件のときも catalog の金額を出す", () => {
    const s = loadScreens(paid({ quizLength: 0 }));
    s.gate(true);
    expect(s.text()).toContain(PAID_LABEL);
  });

  test("読込済みが無料のしきい値以下 (キャッシュが古い) でも catalog を見る", () => {
    const s = loadScreens(paid({ quizLength: 80 }));
    s.gate(true);
    expect(s.text()).toContain(PAID_LABEL);
    expect(s.text()).not.toContain("単品 無料");
  });

  test("読込済みが catalog とずれていても、請求と同じ金額を出す", () => {
    const s = loadScreens(paid({ quizLength: PAID_COUNT + 37 }));
    s.gate(true);
    expect(s.text()).toContain(PAID_LABEL);
  });

  test("呼び出し側が金額を渡したときは、その文字列をそのまま使う", () => {
    const s = loadScreens(paid({ quizUndefined: true }));
    s.gate(true, "¥999/月");
    expect(s.text()).toContain("¥999/月");
    expect(s.buyLabel()).toContain("¥999/月");
  });

  test("使い切っていないときは案内そのものを出さない", () => {
    const s = loadScreens(paid({ quizUndefined: true }));
    s.gate(false);
    expect(s.text()).toBe("");
    expect(s.buyLabel()).toBe("");
  });
});

describe("開始押下時の案内も、同じ出どころから金額を出す", () => {
  test("科目切替中でもペイウォールの文面が「単品 無料」にならない", () => {
    const s = loadScreens(paid({ quizUndefined: true }));
    s.atStart();
    expect(s.paywall()).toContain(PAID_LABEL);
    expect(s.paywall()).not.toContain("単品 無料");
  });

  test("科目切替中でも、開始位置の案内と購入ボタンが同じ金額で揃う", () => {
    const s = loadScreens(paid({ quizUndefined: true }));
    s.atStart();
    expect(s.text()).toContain(PAID_LABEL);
    expect(s.buyLabel()).toContain(PAID_LABEL);
  });

  test("読込済みが 0件でも catalog の金額を出す", () => {
    const s = loadScreens(paid({ quizLength: 0 }));
    s.atStart();
    expect(s.paywall()).toContain(PAID_LABEL);
  });

  test("科目が開いていないときは、金額を名乗らない (0円 に落とさない)", () => {
    const s = loadScreens({ liveCounts: { [PAID]: PAID_COUNT }, quizUndefined: true });
    s.atStart();
    expect(s.buyLabel()).toBe("この問題集を購入");
    expect(s.text()).not.toContain("無料、");
  });
});

describe("無料科目では、この案内が無料のままでよい", () => {
  test("無料科目の金額は 0円 で、ゲートの文面もそれに従う", () => {
    const s = loadScreens({
      liveCounts: { [FREE]: FREE_COUNT },
      openSubject: FREE,
      quizLength: FREE_COUNT,
    });
    expect(s.ent.getSubjectPriceYen(FREE)).toBe(0);
    s.gate(true);
    expect(s.text()).toContain("無料");
  });
});

describe("金額の出どころが1つであること", () => {
  test("ゲートの金額は Entitlement.getSubjectPriceYen と一致する", () => {
    const s = loadScreens(paid({ quizUndefined: true }));
    const yen = s.ent.getSubjectPriceYen(PAID);
    s.gate(true);
    expect(s.text()).toContain(s.ent.formatPrice(yen));
  });

  test("この2関数が Entitlement.priceForQuestionCount を直に呼んでいない", () => {
    const src = fs.readFileSync(SCREENS_SRC, "utf8");
    const from = src.indexOf("function updateStartQuotaGate");
    const to = src.indexOf("function goHome");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const body = src.slice(from, to);
    expect(body).not.toContain("Entitlement.priceForQuestionCount(");
    expect(body).toContain("subjectPriceYenForUi(");
  });
});
