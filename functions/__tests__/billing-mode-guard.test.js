//
// 課金モードの整合性ガード（サブスク → 買い切り 移行の安全装置）
//
// ブリッジは1パッチ=1ファイルで、落ちた1件だけを破棄する。つまり移行は
// 「どれが生き残るか分からない順不同」で本番に入る。危険な中間状態は2方向ある。
//   (A) 金額だけ先に入る  -> mode が subscription のままなので 3980円/月 の課金になる
//   (B) mode だけ先に入る -> 付与処理が無いので「払ったのに使えない」になる
// このテストは両方を落とす。config/pricing.js の CHECKOUT-MODE を唯一の宣言とし、
// それが payment を指すときは付与・Webhook・決済セッションの配線が先に
// 入っていることを要求する。配線が無ければ金額の変更は main に入れない。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const pricingSrc = read("config/pricing.js");
const indexSrc = read("functions/index.js");
const entitlementsSrc = read("functions/entitlements.js");

const client = require(path.join(ROOT, "config", "pricing.js"));
const server = require("../pricing-shared.js");

// 宣言されたモード。判定は「実際に効いている値」を先に見る。
//
// 本番の分岐はすべて export された PricingConfig.CHECKOUT_MODE を読む
// (functions/index.js / js/entitlement.js / legal の差し替え)。ここだけが
// ソース文字列の一致で判定していると、宣言の書き方を変えただけで
// ガードが subscription と誤認し、以下の配線・表記テストが黙って飛ぶ。
// よって export された値を正とし、読めないときだけ文字列一致に落とす。
// CHECKOUT_MODE が無い時代は subscription とみなす。
function declaredMode() {
  const exported = client && client.CHECKOUT_MODE;
  if (exported === "payment" || exported === "subscription") return exported;
  if (pricingSrc.includes('CHECKOUT_MODE = "payment"')) return "payment";
  return "subscription";
}

// サブスク時代の金額。ここを動かすなら mode も同時に動かさなければならない。
const SUBSCRIPTION_ERA = { pack: 1980, max: 980 };
// 買い切りの金額（社長判断 2026-09-29: 単品 290〜1980、パック 3980）
const ONE_TIME_ERA = { pack: 3980, max: 1980 };

const currentAmounts = () => ({ pack: client.PACK_PRICE_YEN, max: client.PRICE_MAX });

describe("課金モードと金額の整合性", () => {
  test("決済セッションの mode が pricing の宣言と食い違わない", () => {
    if (declaredMode() !== "subscription") return;
    expect(indexSrc.includes('mode: "payment"')).toBe(false);
  });

  test("正と写しで CHECKOUT-MODE が一致する", () => {
    expect(server.CHECKOUT_MODE).toBe(client.CHECKOUT_MODE);
  });

  // 読む側はどこも (CHECKOUT_MODE || "subscription") === "payment" の形なので、
  // 綴り違いは例外にならず静かに subscription として動き続ける。
  test("宣言が入ったら値は payment か subscription のどちらかである", () => {
    if (client.CHECKOUT_MODE === undefined) return;
    expect(["payment", "subscription"]).toContain(client.CHECKOUT_MODE);
  });

  test("subscription のうちは買い切りの金額を入れられない", () => {
    if (declaredMode() !== "subscription") return;
    expect(currentAmounts()).toEqual(SUBSCRIPTION_ERA);
  });

  test("payment に切り替えるなら金額も買い切りの表になっている", () => {
    if (declaredMode() !== "payment") return;
    expect(currentAmounts()).toEqual(ONE_TIME_ERA);
  });
});

describe("payment に切り替える前に必要な配線", () => {
  const notYet = () => declaredMode() !== "payment";

  test("entitlements に買い切りの付与処理がある", () => {
    if (notYet()) return;
    expect(entitlementsSrc).toContain("async function applyOneTimePurchase");
    expect(entitlementsSrc).toContain("applyOneTimePurchase,");
  });

  test("Webhook が mode=payment の決済を受け取る", () => {
    if (notYet()) return;
    expect(indexSrc).toContain('session.mode === "payment"');
    expect(indexSrc).toContain("applyOneTimePurchase");
  });

  test("決済セッションが宣言を読んでいる（mode の直書きが残っていない）", () => {
    if (notYet()) return;
    expect(indexSrc).toContain("CHECKOUT_MODE");
    expect(indexSrc.includes('mode: "subscription"')).toBe(false);
  });

  // mode=payment に recurring や subscription-data を付けると Stripe が
  // リクエストごと拒否する。分岐の目印が無いまま mode だけ変わると
  // 誰も購入できなくなるので、目印の存在を要求する。
  test("月額と買い切りの分岐が決済セッションに入っている", () => {
    if (notYet()) return;
    expect(indexSrc).toContain("isOneTimeCheckout");
  });

  // コンビニ・銀行振込のような遅延通知では completed が unpaid で届き、
  // 付与処理がそれを弾く。弾いたあとを拾う節が無いと「払ったのに使えない」。
  test("後払いの入金通知(async-payment-succeeded)を Webhook が受け取る", () => {
    if (notYet()) return;
    expect(indexSrc).toContain('case "checkout.session.async_payment_succeeded"');
  });
});

// 配線が正しくても、表記が「月額」のままで買い切りで課金すれば
// 表示と実際の課金が食い違う。宣言を payment に動かす前に、
// 特商法・利用規約・画面の価格表記を先に直させる。
describe("payment に切り替える前に必要な表記", () => {
  const notYet = () => declaredMode() !== "payment";

  // 文字列の不在で判定すると、正しい買い切り文面まで落ちる。
  // 「継続課金・自動更新はありません」は自動更新という語を含むし、
  // 表記を実行時に切り替える設計では静的HTMLに月額の文面も残る。
  // よって不在ではなく、宣言を読んでいることと買い切り文面の存在を見る。
  test("特商法と規約が宣言を読んでいる", () => {
    if (notYet()) return;
    expect(read("legal/commerce.html")).toContain("CHECKOUT_MODE");
    expect(read("legal/terms.html")).toContain("CHECKOUT_MODE");
  });

  test("特商法と規約に買い切りの文面が入っている", () => {
    if (notYet()) return;
    expect(read("legal/commerce.html")).toContain("買い切り");
    expect(read("legal/terms.html")).toContain("買い切り");
  });

  test("特商法の買い切り文面に価格と継続課金の有無が書かれている", () => {
    if (notYet()) return;
    const commerce = read("legal/commerce.html");
    expect(commerce).toContain("3,980");
    expect(commerce).toContain("継続課金");
  });

  test("画面の価格表記が宣言を読んでいる", () => {
    if (notYet()) return;
    expect(read("js/entitlement.js")).toContain("CHECKOUT_MODE");
  });
});
