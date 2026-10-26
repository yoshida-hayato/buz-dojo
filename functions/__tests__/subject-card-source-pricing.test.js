//
// 科目カードが「出どころの規則」を通して金額を出すことのガード。
//
// 2026-10-26 12:48便 が、無料か有料かを決める軸を問題数から出どころへ
// 付け替えた (社長の 11:08 の指示。公開された過去問は件数に関わらず0円)。
// そのとき直した経路は3つ — 正本 config/pricing.js、画面の
// js/entitlement.js、請求の functions/subject-catalog.js。
//
// 4つめが残っていた。科目一覧のカードは Entitlement.priceForQuestionCount を
// 直に呼んでおり、これは問題数だけを見て sourceType を見ない。しかも
// subjects/registry.js の科目は priceYen を持たないので (10科目とも
// typeof undefined を実測)、この呼び出しは落ち先ではなく唯一の経路だった。
//
// 直す前に実測した。5,000問の公開過去問の科目をカタログに1件入れると、
// カードは 1,980円 を出し、無料ではないと判定し、hasAccess は真なので
// 札は 購読中 になる。買っていない科目に 購読中 と 1,980円 が並ぶ。
// 既存の10科目はすべて自作なので、金額は1円も動かない。
//
// 見張るのは3つ。(1) 出どころの規則がカードに効く (2) 既存の科目の
// 金額が1円も動かない (3) 規則を飛ばす呼び方が画面に1つも残らない
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (...rel) => fs.readFileSync(path.join(ROOT, ...rel), "utf8");

const PRICING_SRC = read("config", "pricing.js");
const ENTITLEMENT_SRC = read("js", "entitlement.js");
const SCREENS_SRC = read("js", "screens-subjects.js");

// 改行をコード点から組むのは、パッチ経路に円記号 (バックスラッシュ) の
// 字面を通せないため (Slack が2つ重ねても1つに畳む)。
const NL = String.fromCharCode(10);

const PUBLIC_ID = "fe-past-exam";
const BIG_COUNT = 5000;

// 公開過去問の大きな科目を1件だけ足した正本を作る。
function pricingWithPublicPastExam() {
  const anchor = "  const SUBJECT_CATALOG = {";
  const injected =
    anchor +
    NL + "    " +
    JSON.stringify(PUBLIC_ID) +
    ": { title: " +
    JSON.stringify("公開過去問の科目") +
    ", questionCount: " +
    BIG_COUNT +
    ", sourceType: SOURCE_PUBLIC_PAST_EXAM },";
  const out = PRICING_SRC.replace(anchor, injected);
  if (out === PRICING_SRC) throw new Error("正本の差し込み位置が変わった");
  return out;
}

function fakeNode() {
  const node = {
    className: "",
    textContent: "",
    innerHTML: "",
    children: [],
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    querySelector(sel) {
      if (String(node.innerHTML).indexOf(sel.replace(".", "")) === -1) return null;
      return { addEventListener() {} };
    },
  };
  return node;
}

// 科目一覧を実際に描かせて、カードの HTML を返す。
function paintCards(opts) {
  const o = opts || {};
  const box = fakeNode();
  const ctx = {
    console,
    JSON,
    Math,
    Date,
    Number,
    String,
    Object,
    Array,
    Set,
    Infinity,
    window: { setTimeout() {} },
    localStorage: { getItem: () => null, setItem() {} },
    document: { createElement: () => fakeNode() },
    escapeHtml: (v) => String(v == null ? "" : v),
    activateSubject: () => Promise.resolve(),
    bindSubjectPurchase: () => {},
    updateBillingManageVisibility: () => {},
    alert: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(pricingWithPublicPastExam(), ctx, { filename: "pricing" });
  vm.runInContext(
    ENTITLEMENT_SRC + NL + ";globalThis.Entitlement = Entitlement;",
    ctx,
    { filename: "entitlement" }
  );
  vm.runInContext(SCREENS_SRC, ctx, { filename: "screens-subjects" });
  const rows = (o.rows || []).map((r) => ({
    s: { id: r.id, title: r.id, shortTitle: r.id, description: "" },
    rank: null,
    mastered: 0,
    answered: 0,
    total: r.total,
    err: false,
  }));
  ctx.paintSubjectPickerCards(box, rows, false);
  return {
    cards: box.children.map((c) => String(c.innerHTML)).filter((h) => h.indexOf("subject-card-title") !== -1),
    ent: ctx.Entitlement,
  };
}

describe("出どころの規則がカードに効く", () => {
  const out = paintCards({ rows: [{ id: PUBLIC_ID, total: BIG_COUNT }] });

  test("カードが1枚描けている (描けていなければ以下は何も見張れない)", () => {
    expect(out.cards.length).toBe(1);
  });

  test("公開過去問の科目は、札が 全問無料 になる", () => {
    expect(out.cards[0]).toContain("全問無料");
  });

  test("買っていない科目に 購読中 や 購入済み を出さない", () => {
    expect(out.cards[0]).not.toContain("購読中");
    expect(out.cards[0]).not.toContain("購入済み");
  });

  test("金額の欄そのものを出さない", () => {
    expect(out.cards[0]).not.toContain("subject-card-price");
  });

  test("上限額の字面がカードに出ない", () => {
    const cap = out.ent.formatPrice(out.ent.PRICE_MAX);
    expect(out.cards[0]).not.toContain(cap);
  });

  test("購入ボタンを出さない", () => {
    expect(out.cards[0]).not.toContain("subject-buy-btn");
  });

  test("学習ボタンは 無料で学習 ではなく 学習する になる", () => {
    expect(out.cards[0]).toContain("学習する");
    expect(out.cards[0]).not.toContain("無料で学習");
  });
});

describe("自作の科目は、同じ件数でも有料のまま (金額が1円も動かない)", () => {
  const out = paintCards({ rows: [{ id: "sap", total: BIG_COUNT }] });

  test("金額の欄が出る", () => {
    expect(out.cards[0]).toContain("subject-card-price");
  });

  test("上限額が出る (5,000問は上限の段)", () => {
    expect(out.cards[0]).toContain(out.ent.formatPrice(out.ent.PRICE_MAX));
  });

  test("購入ボタンが出る", () => {
    expect(out.cards[0]).toContain("subject-buy-btn");
  });

  test("札は 本日あと20問 のまま", () => {
    expect(out.cards[0]).toContain("本日あと20問");
  });
});

describe("規則を飛ばす呼び方が画面に残っていない", () => {
  // 語の有無ではなく、効いている式そのものを見る。
  test("カードは priceForSubject を通している", () => {
    expect(SCREENS_SRC).toContain("Entitlement.priceForSubject(s.id, total)");
  });

  test("priceForQuestionCount を直に呼ぶ式が1つも無い", () => {
    const calls = SCREENS_SRC.split("Entitlement.priceForQuestionCount(").length - 1;
    expect(calls).toBe(0);
  });

  test("正本の priceForSubject は、件数より出どころを先に見る", () => {
    const out = paintCards({ rows: [] });
    const P = vm.runInContext;
    expect(out.ent.priceForSubject(PUBLIC_ID, BIG_COUNT)).toBe(0);
    expect(out.ent.priceForSubject(PUBLIC_ID, 1)).toBe(0);
    expect(out.ent.priceForSubject("sap", BIG_COUNT)).toBe(out.ent.PRICE_MAX);
    expect(typeof P).toBe("function");
  });
});
