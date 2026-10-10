//
// 管理画面の Stripe 状態タブのガード。
//
// この画面は「返金とチャージバックで付与が取り消されるか」を社長が
// コンソールを使わずに読むために在る。だから壊れ方は2通りある。
//
//   1. 画面が読み込まれない (reports.html の CORE から外れる)
//   2. 呼ぶ口の名前が functions/index.js の exports とずれる
//
// どちらも「タブはあるのに何も出ない / エラーだけ出る」形で静かに壊れる。
// さらに、取り消しの経路として見張る2件が index.js の必要イベントから
// ずれたら、画面が「購読済みです」と嘘をつく。字面で突き合わせる。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PANEL = path.join(ROOT, "js", "admin-stripe-status.js");
const REPORTS = path.join(ROOT, "admin", "reports.html");
const FUNCS = path.join(ROOT, "functions", "index.js");

const CALLABLES = ["getStripeMode", "getStripeWebhookStatus"];
const REVOKE = ["charge.refunded", "charge.dispute.closed"];

describe("管理画面の Stripe 状態タブ", () => {
  test("パネルのファイルが在る", () => {
    expect(fs.existsSync(PANEL)).toBe(true);
  });

  const panel = fs.existsSync(PANEL) ? fs.readFileSync(PANEL, "utf8") : "";
  const reports = fs.readFileSync(REPORTS, "utf8");
  const funcs = fs.readFileSync(FUNCS, "utf8");

  test("reports.html が CORE でこのファイルを読み込んでいる", () => {
    expect(reports.indexOf("../js/admin-stripe-status.js") >= 0).toBe(true);
  });

  test("呼ぶ口の名前が functions の exports と一致している", () => {
    CALLABLES.forEach((name) => {
      expect(panel.indexOf(name) >= 0).toBe(true);
      expect(funcs.indexOf("exports." + name + " = onCall(") >= 0).toBe(true);
    });
  });

  test("取り消しの経路2件が index.js の必要イベントに入っている", () => {
    REVOKE.forEach((name) => {
      expect(panel.indexOf(name) >= 0).toBe(true);
    });
    const start = funcs.indexOf("const WEBHOOK_EVENTS_REQUIRED = [");
    expect(start).toBeGreaterThan(0);
    const required = funcs.slice(start, funcs.indexOf("]", start));
    REVOKE.forEach((name) => {
      expect(required.indexOf(name) >= 0).toBe(true);
    });
  });

  test("外から来た字面を escape してから innerHTML に渡している", () => {
    // url は Stripe から来る文字列で、そのまま innerHTML に入れたら注入になる。
    expect(panel.indexOf("esc(ep.url") >= 0).toBe(true);
    // 数値や状態は stat() を通る。stat() がラベルと値の両方を escape していること。
    expect(panel.indexOf("esc(label)") >= 0).toBe(true);
    expect(panel.indexOf("esc(value)") >= 0).toBe(true);
  });

  test("鍵の字面を画面に出す口が無い", () => {
    expect(panel.indexOf("stripeSecret") < 0).toBe(true);
    expect(panel.indexOf("sk_") < 0).toBe(true);
  });

  test("自分のタブだけを畳む委譲リスナを持っている", () => {
    expect(panel.indexOf('nav.addEventListener("click"') >= 0).toBe(true);
    expect(panel.indexOf("panel-stripe") >= 0).toBe(true);
  });
});
