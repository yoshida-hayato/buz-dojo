// ホーム画面の「金額」と「無料かどうか」が、請求と同じ出どころから出ることのガード。
//
// 2026-10-04 の 20:48便 は js/entitlement.js の getSubjectPriceYen を、
// 00:48便 は isFreeSubject を、catalog.js 優先 (= 請求と同じ) に直した。
// ところが js/screens-subjects.js の2か所は、そのどちらも通らずに
// Entitlement.priceForQuestionCount(QUIZ_DATA.length) を直に呼んでいた。
//
// QUIZ_DATA は js/subject-loader.js の clearGlobals() が科目切替のたびに
// undefined にする。priceForQuestionCount(0) は 0 を返し、0 は「無料」と
// 読まれるので、有料科目でも金額が 0円・無料枠のゲートが外れる側に倒れた。
// catalog.js の件数と読込済みの件数がずれたときも、表示だけがずれる。
//
// 画面側は素のスクリプトなので vm で評価する (price-source-consistency と同型)。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ENTITLEMENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const SCREENS_SRC = path.join(__dirname, "..", "..", "js", "screens-subjects.js");
const FREE_LIMIT = 100;
const PAID_COUNT = 400;
const PAID = "windows-shortcuts";
const FREE = "ai-ontology-intro";

// 画面側を評価する。
// liveCounts = catalog.js 側の件数 / quizLength = 読込済みの QUIZ_DATA の件数
// quizUndefined = 科目切替の最中 (QUIZ_DATA が undefined)
function loadScreens(opts) {
  const o = opts || {};
  const live = o.liveCounts || {};
  const store = {};
  const ctx = {
    console,
    PricingConfig: pricing,
    SubjectCatalog: {
      getQuestionCountSync(id) {
        return typeof live[id] === "number" ? live[id] : 0;
      },
    },
    CURRENT_SUBJECT: o.openSubject ? { id: o.openSubject } : null,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
    },
  };
  if (!o.quizUndefined) ctx.QUIZ_DATA = new Array(o.quizLength || 0).fill({});
  vm.createContext(ctx);
  // const 宣言はコンテキストのプロパティにならないので、同じスクリプトの末尾で渡す
  vm.runInContext(
    fs.readFileSync(ENTITLEMENT_SRC, "utf8") +
      "\n;globalThis.Entitlement = Entitlement;",
    ctx
  );
  // screens-subjects.js の最上位は宣言だけなので、読み込んでも副作用は無い
  vm.runInContext(fs.readFileSync(SCREENS_SRC, "utf8"), ctx);
  return {
    ent: ctx.Entitlement,
    priceForUi: ctx.subjectPriceYenForUi,
    isFreeQuotaExhausted: ctx.isFreeQuotaExhausted,
    // 無料枠を使い切った状態にする
    useUpFreeQuota(sid) {
      store["biz_dojo_daily_usage_v1"] = JSON.stringify({
        [sid]: {
          date: ctx.Entitlement.jstDateKey(),
          count: ctx.Entitlement.FREE_DAILY,
        },
      });
    },
  };
}

describe("画面の金額は、読込済みの件数ではなく catalog から出る", () => {
  test("有料科目: 科目切替中 (QUIZ_DATA が undefined) でも 0円にならない", () => {
    const s = loadScreens({ liveCounts: { [PAID]: PAID_COUNT }, quizUndefined: true });
    expect(s.priceForUi(PAID, 0)).toBe(pricing.priceForQuestionCount(PAID_COUNT));
    expect(s.priceForUi(PAID, 0)).toBeGreaterThan(0);
  });

  test("有料科目: 読込済みが 0件でも、catalog の金額を出す", () => {
    const s = loadScreens({ liveCounts: { [PAID]: PAID_COUNT } });
    expect(s.priceForUi(PAID, 0)).toBe(pricing.priceForQuestionCount(PAID_COUNT));
  });

  test("有料科目: 読込済みの件数が catalog とずれても、catalog を見る", () => {
    const s = loadScreens({ liveCounts: { [PAID]: PAID_COUNT } });
    expect(s.priceForUi(PAID, 12)).toBe(pricing.priceForQuestionCount(PAID_COUNT));
    expect(s.priceForUi(PAID, 9999)).toBe(pricing.priceForQuestionCount(PAID_COUNT));
  });

  test("無料科目は 0円のまま (ロックする側に倒していない)", () => {
    const s = loadScreens({ liveCounts: { [FREE]: 60 } });
    expect(s.priceForUi(FREE, 0)).toBe(0);
  });

  test("しきい値のちょうど上 (catalog 100) は 0円", () => {
    const s = loadScreens({ liveCounts: { [PAID]: FREE_LIMIT } });
    expect(s.priceForUi(PAID, FREE_LIMIT)).toBe(0);
  });

  test("catalog に無い科目は、読込済みの件数に落ちる (直す前と同じ)", () => {
    const s = loadScreens({ liveCounts: {} });
    expect(s.priceForUi("no-such-subject", PAID_COUNT)).toBe(
      pricing.priceForQuestionCount(PAID_COUNT)
    );
    expect(s.priceForUi("no-such-subject", 0)).toBe(0);
  });

  test("公式の catalog では、画面の金額と Entitlement の金額が全科目で一致する", () => {
    const liveCounts = Object.keys(pricing.SUBJECT_CATALOG).reduce((acc, id) => {
      acc[id] = pricing.SUBJECT_CATALOG[id].questionCount;
      return acc;
    }, {});
    const s = loadScreens({ liveCounts });
    Object.keys(pricing.SUBJECT_CATALOG).forEach((id) => {
      // 読込済みの件数をわざと食い違わせても、画面の金額は動かない
      expect(s.priceForUi(id, 3)).toBe(s.ent.getSubjectPriceYen(id));
    });
  });
});

describe("無料枠のゲートは、科目切替中に外れない", () => {
  test("有料科目で枠を使い切っていれば、QUIZ_DATA が undefined でも true", () => {
    const s = loadScreens({
      liveCounts: { [PAID]: PAID_COUNT },
      openSubject: PAID,
      quizUndefined: true,
    });
    s.useUpFreeQuota(PAID);
    expect(s.ent.remainingFree(PAID)).toBe(0);
    expect(s.isFreeQuotaExhausted()).toBe(true);
  });

  test("有料科目で枠が残っていれば false", () => {
    const s = loadScreens({
      liveCounts: { [PAID]: PAID_COUNT },
      openSubject: PAID,
      quizUndefined: true,
    });
    expect(s.isFreeQuotaExhausted()).toBe(false);
  });

  test("無料科目は、枠を使い切っても false (制限しない)", () => {
    const s = loadScreens({
      liveCounts: { [FREE]: 60 },
      openSubject: FREE,
      quizLength: 60,
    });
    s.useUpFreeQuota(FREE);
    expect(s.isFreeQuotaExhausted()).toBe(false);
  });

  test("科目が開いていなければ false", () => {
    const s = loadScreens({ liveCounts: { [PAID]: PAID_COUNT } });
    expect(s.isFreeQuotaExhausted()).toBe(false);
  });
});
