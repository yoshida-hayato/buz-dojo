/**
 * 結果画面の購入導線: 器と配線の見張り。
 *
 * 振る舞いは result-upsell の1枚が vm で見ている。こちらは置き場所を見る。
 *   - renderResult が renderResultUpsell を呼ぶこと
 *   - 残り問数の字を結果画面に書き写さず Entitlement に通すこと
 *   - 器が操作ボタン (.result-actions) より前に在ること
 *   - ボタンの見える字に金額を入れないこと (buy-button-label と同じ理由)
 *   - 2つのボタンが startCheckout に繋がっていること
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const RESULT_SRC = fs.readFileSync(path.join(ROOT, "js", "screens-result.js"), "utf8");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BILLING_UI = fs.readFileSync(path.join(ROOT, "js", "billing-ui.js"), "utf8");

describe("結果画面の購入導線: 器と配線", () => {
  test("renderResult が renderResultUpsell を呼ぶ", () => {
    expect(RESULT_SRC.includes("renderResultUpsell();")).toBe(true);
  });

  test("字面を自前で組まず Entitlement.freeQuotaLabel を通る", () => {
    expect(RESULT_SRC.includes("Entitlement.freeQuotaLabel")).toBe(true);
    // 残り問数の字を結果画面に書き写したら落ちる
    expect(RESULT_SRC.includes("本日あと")).toBe(false);
  });

  test("壁 (paywall_view) を結果画面から立てていない", () => {
    // コメントで名前に触れるのは可。logEvent の引数に出たら落ちる
    expect(RESULT_SRC.includes('logEvent("paywall_view"')).toBe(false);
    expect(RESULT_SRC.includes('logEvent("result_upsell_view"')).toBe(true);
  });

  test("器が操作ボタンより前に在る", () => {
    const box = INDEX_HTML.indexOf('id="result-upsell"');
    const actions = INDEX_HTML.indexOf('class="result-actions"');
    expect(box).toBeGreaterThan(0);
    expect(actions).toBeGreaterThan(0);
    expect(box).toBeLessThan(actions);
  });

  test("ボタンの見える字に金額を入れない", () => {
    const labels = ["この問題集を購入", "プレミアムパック"];
    for (const id of ["result-buy-subject-btn", "result-buy-pack-btn"]) {
      const at = INDEX_HTML.indexOf('id="' + id + '"');
      expect(at).toBeGreaterThan(0);
      const tail = INDEX_HTML.slice(at, at + 120);
      const label = labels.find((l) => tail.includes(l));
      expect(label).toBeDefined();
      expect(/[0-9]/.test(label)).toBe(false);
    }
  });

  test("2つのボタンが startCheckout に繋がっている", () => {
    expect(BILLING_UI.includes("result-buy-subject-btn")).toBe(true);
    expect(BILLING_UI.includes("result-buy-pack-btn")).toBe(true);
    expect(BILLING_UI.includes("result_upsell_click")).toBe(true);
  });
});
