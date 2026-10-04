/**
 * js/billing の、パック購入前の二重払い警告の単体テスト。
 *
 * なぜ functions/__tests__ に置くか:
 *   パッチの検証ゲートが jest を走らせるのは functions の中だけで、
 *   js 配下にテストの置き場所が無い。exam-countdown と同じ理由。
 *
 * 読み込み方:
 *   素のスクリプトなので vm で評価し、トップレベルの関数宣言を
 *   コンテキストのプロパティとして取り出す。ファイル末尾の
 *   handleCheckoutQuery を走らせないため、document の readyState は
 *   loading のスタブにする (こうすると DOMContentLoaded 待ちになる)。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = path.join(__dirname, "..", "..", "js", "billing.js");

/** 追加のグローバルを与えて billing を評価する */
function load(extra) {
  const src = fs.readFileSync(SOURCE, "utf8");
  const base = {
    console,
    JSON,
    Math,
    Number,
    Object,
    Array,
    document: {
      readyState: "loading",
      addEventListener: function () {},
    },
    window: { location: { search: "", href: "" } },
  };
  const ctx = vm.createContext(Object.assign(base, extra || {}));
  ctx.window.document = ctx.document;
  vm.runInContext(src, ctx, { filename: "billing.js" });
  return ctx;
}

const PRICES = { sap: 1980, excel: 980, outlook: 590 };
const priceOf = (id) => PRICES[id] || 0;

describe("ownedPaidSubjectIds", () => {
  const { ownedPaidSubjectIds } = load();

  test("パック所有者は上げ先が無いので空", () => {
    const ent = { pack: true, subjects: { sap: { status: "active" } } };
    expect(ownedPaidSubjectIds(ent)).toEqual([]);
  });

  test("active と trialing を拾い、ID順に並べる", () => {
    const ent = {
      subjects: {
        sap: { status: "active" },
        excel: { status: "trialing" },
        outlook: { status: "canceled" },
      },
    };
    expect(ownedPaidSubjectIds(ent)).toEqual(["excel", "sap"]);
  });

  test("真偽値での付与も所有として数える", () => {
    expect(ownedPaidSubjectIds({ subjects: { sap: true, excel: false } })).toEqual(["sap"]);
  });

  test("空や未定義でも落ちない", () => {
    expect(ownedPaidSubjectIds(undefined)).toEqual([]);
    expect(ownedPaidSubjectIds({})).toEqual([]);
  });
});

describe("ownedPaidSubjectYen", () => {
  const { ownedPaidSubjectYen } = load();

  test("記録された支払額を優先する", () => {
    const ent = { subjects: { sap: { status: "active", amountYen: 1480 } } };
    expect(ownedPaidSubjectYen(ent, ["sap"], priceOf)).toBe(1480);
  });

  test("記録が無い付与は現在の定価で代用する", () => {
    const ent = { subjects: { sap: { status: "active" } } };
    expect(ownedPaidSubjectYen(ent, ["sap"], priceOf)).toBe(1980);
  });

  test("真偽値での付与も定価で代用する", () => {
    expect(ownedPaidSubjectYen({ subjects: { excel: true } }, ["excel"], priceOf)).toBe(980);
  });

  test("複数科目は合算する", () => {
    const ent = {
      subjects: { sap: { status: "active", amountYen: 1980 }, excel: { status: "active" } },
    };
    expect(ownedPaidSubjectYen(ent, ["sap", "excel"], priceOf)).toBe(2960);
  });

  test("壊れた記録は定価にも 0 にも倒れて負にならない", () => {
    const ent = { subjects: { sap: { status: "active", amountYen: -500 } } };
    expect(ownedPaidSubjectYen(ent, ["sap"], priceOf)).toBe(1980);
    expect(ownedPaidSubjectYen(ent, ["sap"], undefined)).toBe(0);
  });

  test("ID の配列が空や未定義なら 0", () => {
    expect(ownedPaidSubjectYen({ subjects: {} }, [], priceOf)).toBe(0);
    expect(ownedPaidSubjectYen(undefined, undefined, priceOf)).toBe(0);
  });
});

describe("packUpgradeWarningText", () => {
  const { packUpgradeWarningText } = load();

  test("沈む額が無ければ空文字 (警告を出さない合図)", () => {
    expect(packUpgradeWarningText(0, 0, 3980)).toBe("");
    expect(packUpgradeWarningText(1, 0, 3980)).toBe("");
    expect(packUpgradeWarningText(0, 1980, 3980)).toBe("");
  });

  test("件数と支払い済み額と合計額を言う", () => {
    const t = packUpgradeWarningText(1, 1980, 3980);
    expect(t).toContain("単品を1件");
    expect(t).toContain("1,980");
    expect(t).toContain("5,960");
  });

  test("返金も差額調整もされないことを明言する", () => {
    const t = packUpgradeWarningText(2, 2960, 3980);
    expect(t).toContain("返金");
    expect(t).toContain("差額調整");
    expect(t).toContain("6,940");
  });

  test("数値でない入力でも落ちない", () => {
    expect(packUpgradeWarningText(null, null, null)).toBe("");
    expect(packUpgradeWarningText("2", "1980", "3980")).toContain("5,960");
  });
});

describe("confirmPackUpgrade", () => {
  function run(opts) {
    const asked = [];
    const ctx = load({
      Entitlement: {
        isOneTime: () => opts.oneTime,
        getEntitlements: () => opts.ent,
        getSubjectPriceYen: priceOf,
      },
      PricingConfig: { PACK_PRICE_YEN: 3980 },
    });
    ctx.window.confirm = (text) => {
      asked.push(text);
      return opts.answer !== false;
    };
    return { ok: ctx.confirmPackUpgrade(), asked };
  }

  test("月額のときは何も出さず素通し", () => {
    const r = run({ oneTime: false, ent: { subjects: { sap: { status: "active" } } } });
    expect(r.asked.length).toBe(0);
    expect(r.ok).toBe(true);
  });

  test("買い切りでも単品を持っていなければ素通し", () => {
    const r = run({ oneTime: true, ent: { subjects: {} } });
    expect(r.asked.length).toBe(0);
    expect(r.ok).toBe(true);
  });

  test("買い切りで単品を持っていれば1度だけ確認する", () => {
    const r = run({ oneTime: true, ent: { subjects: { sap: { status: "active" } } } });
    expect(r.asked.length).toBe(1);
    expect(r.asked[0]).toContain("5,960");
    expect(r.ok).toBe(true);
  });

  test("取り消されたら偽を返す (決済に進ませない)", () => {
    const r = run({
      oneTime: true,
      ent: { subjects: { sap: { status: "active" } } },
      answer: false,
    });
    expect(r.ok).toBe(false);
  });

  test("Entitlement が未読込でも素通しして決済を止めない", () => {
    const ctx = load({ PricingConfig: { PACK_PRICE_YEN: 3980 } });
    expect(ctx.confirmPackUpgrade()).toBe(true);
  });
});
