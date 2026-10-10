// 科目カードの購入ボタンに「金額を書かない」ことのガード。
//
// 2026-10-10 23:11 に社長から「Footer汚いなあ / というかアプリ全体の UIUX
// 気に入ってない」と指摘を受け、実ブラウザ (Chromium) で科目一覧を測った。
// 購入ボタンの字が「購入 ¥1,980（買い切り）」で、幅 360 / 390 / 430 / 768 の
// すべてで「購入 ¥1,980（買い」「切り）」と語の途中で2行に割れていた。
// いまの携帯の主要な幅がすべて入る。買う直前のいちばん大事なボタンが崩れ、
// 隣の「無料で学習」も背が引き伸ばされてカードの背丈が揃わなくなっていた。
//
// 金額はボタンの外 (.subject-card-meta) に太字で出ている。ボタンは動詞だけに
// する、というのがカード型 UI の普通の形で、こうすると二度と割れない。
// このガードは「誰かが金額をボタンの字に戻したら落ちる」ためのもの。
//
// 画面側は素のスクリプトなので vm で評価する (ui-price-source と同型)。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");
const BILLING_UI_SRC = path.join(__dirname, "..", "..", "js", "billing-ui.js");

// 幅 360 の端末で、ボタン1つに割り当てられる内側の幅 (実測 126px から左右の
// padding 12px を引いた 102px)。全角1文字 13px なので、全角7文字が上限。
const MAX_VISIBLE_CHARS = 7;

function makeButton() {
  const attrs = {};
  return {
    textContent: "",
    disabled: false,
    classList: { add() {}, remove() {} },
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    getAttribute(k) {
      return k in attrs ? attrs[k] : null;
    },
  };
}

// billing-ui.js の最上位は宣言と window への代入が1つだけなので、
// window を空の入れ物として渡せば、読み込んでも副作用は無い。
function loadBillingUi(opts) {
  const o = opts || {};
  const ctx = {
    console,
    document: { getElementById: () => null },
    window: {},
    $: () => null,
    Entitlement: {
      hasAccess: () => Boolean(o.subscribed),
      formatPrice: (yen) =>
        "¥" + Number(yen).toLocaleString("ja-JP") + "（買い切り）",
      ownedLabel: () => "購入済み",
    },
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(BILLING_UI_SRC, "utf8") +
      "\n;globalThis.bindSubjectPurchase = bindSubjectPurchase;",
    ctx
  );
  return ctx.bindSubjectPurchase;
}

function bind(priceYen, opts) {
  const btn = makeButton();
  loadBillingUi(opts)(btn, "sap", priceYen);
  return btn;
}

describe("購入ボタンの見える字に金額を入れない (狭い端末で割れるため)", () => {
  test("金額の数字も通貨記号もボタンの字に出ない", () => {
    const btn = bind(1980);
    expect(btn.textContent).not.toMatch(/[0-9]/);
    expect(btn.textContent).not.toContain("¥");
    expect(btn.textContent).not.toContain("買い切り");
  });

  test("公式の価格表のどの金額でも、字は同じで、幅の上限を超えない", () => {
    const prices = Object.keys(pricing.SUBJECT_CATALOG)
      .map((id) => pricing.priceForQuestionCount(
        pricing.SUBJECT_CATALOG[id].questionCount
      ))
      .filter((y) => y > 0);
    expect(prices.length).toBeGreaterThan(0);
    const labels = new Set(prices.map((y) => bind(y).textContent));
    expect(labels.size).toBe(1);
    const label = [...labels][0];
    expect(label.length).toBeLessThanOrEqual(MAX_VISIBLE_CHARS);
    expect(label).toContain("購入");
  });

  test("金額は aria-label に残る (読み上げはボタン単体で聞くので)", () => {
    const btn = bind(1980);
    const aria = btn.getAttribute("aria-label");
    expect(aria).toContain("1,980");
    expect(aria).toContain("購入");
  });

  test("購入済みなら、字は購入済みで、押せず、aria-label は残さない", () => {
    const btn = bind(1980, { subscribed: true });
    expect(btn.textContent).toBe("購入済み");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-label")).toBe(null);
  });

  test("無料科目 (0円) ではボタン自体を出さない (従来どおり)", () => {
    const btn = bind(0);
    expect(btn.textContent).toBe("");
  });
});
