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

