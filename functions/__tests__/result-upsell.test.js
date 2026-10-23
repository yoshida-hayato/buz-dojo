/**
 * 結果画面の購入導線 (renderResultUpsell) の、振る舞いの見張り。
 * 出す条件は hasAccess が偽であることだけ。金額が取れないときは黙る。
 * 器と配線は result-upsell-wiring の1枚が見る。
 * 最上位はすべて関数宣言なので、vm で評価しても副作用は無い。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "screens-result.js"),
  "utf8"
);
const IDS = ["result-upsell", "result-upsell-quota", "result-upsell-text"];

function makeEl() {
  const cl = new Set(["hidden"]);
  return {
    textContent: "",
    classList: {
      add: (c) => cl.add(c),
      remove: (c) => cl.delete(c),
      contains: (c) => cl.has(c),
    },
  };
}

function render(o) {
  const els = {};
  for (const id of IDS) els[id] = makeEl();
  const events = [];
  const ctx = vm.createContext({
    console,
    $: (id) => els[id] || null,
    CURRENT_SUBJECT: { id: o.subjectId },
    QUIZ_DATA: [],
    PricingConfig: { PACK_PRICE_YEN: o.packYen === undefined ? 3980 : o.packYen },
    subjectPriceYenForUi: () => o.priceYen,
    Entitlement: {
      hasAccess: () => Boolean(o.hasAccess),
      remainingFree: () => o.rem,
      freeQuotaLabel: (r) =>
        Number(r) > 0 ? "本日あと" + r + "問" : "本日の無料ぶんは終了",
      formatPrice: (y) => "¥" + Number(y).toLocaleString("ja-JP") + "（買い切り）",
    },
    firebase: {
      analytics: () => ({ logEvent: (name, params) => events.push({ name, params }) }),
    },
  });
  vm.runInContext(SRC + "\nrenderResultUpsell();", ctx, { filename: "screens-result.js" });
  return {
    hidden: els[IDS[0]].classList.contains("hidden"),
    quota: els[IDS[1]].textContent,
    text: els[IDS[2]].textContent,
    events,
  };
}

const PAID = { subjectId: "biz-career", hasAccess: false, priceYen: 710 };

describe("結果画面の購入導線", () => {
  test("枠が残っていれば、残りと単品とパックの金額を出す", () => {
    const r = render(Object.assign({}, PAID, { rem: 7 }));
    expect(r.hidden).toBe(false);
    expect(r.quota).toBe("本日あと7問");
    expect(r.text).toContain("¥710（買い切り）");
    expect(r.text).toContain("¥3,980（買い切り）");
  });

  test("使い切っていれば、終了と翌朝のリセットを出す", () => {
    const r = render(Object.assign({}, PAID, { rem: 0 }));
    expect(r.hidden).toBe(false);
    expect(r.quota).toBe("本日の無料ぶんは終了");
    expect(r.text).toContain("リセット");
    expect(r.text).toContain("¥710（買い切り）");
  });

  test("hasAccess が真なら何も出さない", () => {
    const r = render({ subjectId: "outlook-mail", hasAccess: true, priceYen: 0, rem: 20 });
    expect(r.hidden).toBe(true);
    expect(r.quota).toBe("");
    expect(r.text).toBe("");
  });

  test("金額が取れないときは黙る", () => {
    const r = render({ subjectId: "biz-career", hasAccess: false, priceYen: 0, rem: 5 });
    expect(r.hidden).toBe(true);
    expect(r.text).toBe("");
  });

  test("隠すときは前の科目の字を残さない", () => {
    const r = render(Object.assign({}, PAID, { hasAccess: true, rem: 3 }));
    expect(r.quota).toBe("");
    expect(r.text).toBe("");
  });

  test("パックの金額が無ければ、パックに触れない", () => {
    const r = render(Object.assign({}, PAID, { rem: 7, packYen: 0 }));
    expect(r.hidden).toBe(false);
    expect(r.text).toContain("¥710（買い切り）");
    expect(r.text).not.toContain("プレミアムパック");
  });

  test("出したときだけ result_upsell_view を1回立てる", () => {
    const shown = render(Object.assign({}, PAID, { rem: 0 }));
    expect(shown.events.map((e) => e.name)).toEqual(["result_upsell_view"]);
    expect(shown.events[0].params.exhausted).toBe(1);
    expect(shown.events[0].params.price_yen).toBe(710);
    const hidden = render({ subjectId: "outlook-mail", hasAccess: true, priceYen: 0, rem: 20 });
    expect(hidden.events).toEqual([]);
  });
});
