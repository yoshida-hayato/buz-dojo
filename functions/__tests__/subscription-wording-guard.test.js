//
// 画面に出る「購読」語のガード
//
// CHECKOUT_MODE が payment に変わると、課金は買い切りになり、解約も自動更新も
// 無くなる。画面表記は js/entitlement.js の ownedLabel / unownedLabel を
// 唯一の出口にして宣言1つで切り替わるようにしてあるが、その出口を通らずに
// 文面へ直書きされた「購読」は、切替の日に黙って嘘になる。
//
// このファイルは、直書きが無いことを字面で見る。CHECKOUT_MODE の値に
// 関係なく常に走らせる。切替の日ではなく、直書きを入れた日に落とすため。
//
// 字面で見る理由: vm の素のコンテキストに評価しても const は取り出せない
// (2026-10-04 08:48便の記録)。だから評価結果ではなくファイルの中身を読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 正規表現は使わない (パッチ経路に量指定子を通せない)。
function count(hay, needle) {
  let n = 0;
  let at = hay.indexOf(needle);
  while (at >= 0) {
    n = n + 1;
    at = hay.indexOf(needle, at + needle.length);
  }
  return n;
}

// 買い切りでは必ず嘘になる語。
const SUBSCRIPTION_WORDS = ["購読", "サブスクリプション", "定期課金", "自動更新"];

describe("プライバシーポリシーに購読語が戻っていないこと", () => {
  const src = read("legal/privacy.html");

  // 法務3ページのうち terms と commerce は payment のとき JavaScript で
  // 本文を差し替える (legal-swap-targets で当たることを見ている)。
  // privacy は差し替えを持たず、両モードで通る文面に直してある
  // (2026-10-04 02:48便)。だから静的な字面が唯一の守りになる。
  SUBSCRIPTION_WORDS.forEach((word) => {
    test("privacy に " + word + " が無い", () => {
      expect(count(src, word)).toBe(0);
    });
  });

  test("差し替えスクリプトを持たない (持つなら legal-swap-targets 側で見る約束)", () => {
    expect(src.indexOf("config/pricing") < 0).toBe(true);
  });

  // 失敗時にファイル全体が出力に流れないよう、件数で見る。
  test("決済関連情報の項は残っている", () => {
    expect(count(src, "決済関連情報")).toBe(1);
    expect(count(src, "Stripe") > 0).toBe(true);
  });
});

