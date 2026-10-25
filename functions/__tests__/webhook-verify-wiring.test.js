//
// 署名検証の台帳が、本番の経路に実際に繋がっていることの見張り。
//
// 台帳そのものの振る舞いは webhook-verify-ledger が見る。こちらは配線。
// 繋がっていなければ、台帳は永久に空のままで、画面は
// 「記録はまだ1件もありません」と言い続ける。静かに壊れる形なので字面で見る。
//
// 見るのは4つ。
//   1. 失敗の経路 (catch の中) で記録していること
//   2. 成功の経路 (try を抜けた直後) で記録していること
//   3. どちらも await していること (await しないと、器が先に終わって書けない)
//   4. 管理画面の口が台帳を読んで返していること
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const INDEX = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
const PANEL = fs.readFileSync(path.join(ROOT, "js", "admin-stripe-status.js"), "utf8");

function sliceExport(name) {
  const head = "exports." + name + " = ";
  const start = INDEX.indexOf(head);
  if (start < 0) return "";
  // 改行を字面で書かない (円記号をパッチ経路に載せない約束)
  const NL = String.fromCharCode(10);
  const after = INDEX.indexOf(NL + "exports.", start + head.length);
  return after < 0 ? INDEX.slice(start) : INDEX.slice(start, after);
}

describe("functions — 台帳が webhook に繋がっている", () => {
  const hook = sliceExport("stripeWebhook");

  test("切り出せている", () => {
    expect(hook.length).toBeGreaterThan(400);
  });

  test("台帳を読み込んでいる", () => {
    expect(INDEX.indexOf('require("./webhook-health")') >= 0).toBe(true);
    expect(INDEX.indexOf("recordVerifyResult") >= 0).toBe(true);
    expect(INDEX.indexOf("readVerifyHealth") >= 0).toBe(true);
  });

  test("失敗のときに記録している (偽を渡している)", () => {
    expect(hook.indexOf("await recordVerifyResult(admin.firestore(), false, err.message)") >= 0).toBe(true);
  });

  test("成功のときに記録している (真を渡している)", () => {
    expect(hook.indexOf("await recordVerifyResult(admin.firestore(), true,") >= 0).toBe(true);
  });

  test("記録は400を返す前に済ませている", () => {
    const rec = hook.indexOf("recordVerifyResult(admin.firestore(), false");
    const send = hook.indexOf("res.status(400)");
    expect(rec >= 0 && send > rec).toBe(true);
  });

  test("成功の記録は、署名検証を抜けた後に在る", () => {
    const verify = hook.indexOf("constructEvent");
    const rec = hook.indexOf("recordVerifyResult(admin.firestore(), true");
    expect(verify >= 0 && rec > verify).toBe(true);
  });
});

describe("functions — 管理画面の口が台帳を返している", () => {
  const status = sliceExport("getStripeWebhookStatus");

  test("読んでから返している", () => {
    const read = status.indexOf("readVerifyHealth(admin.firestore())");
    const ret = status.lastIndexOf("return {");
    expect(read >= 0 && ret > read).toBe(true);
    expect(status.indexOf("verify,") >= 0).toBe(true);
  });
});

describe("画面 — 4つの場合を描き分ける", () => {
  function render(verify) {
    const win = {};
    const ctx = vm.createContext({
      console,
      window: win,
      escapeHtml: (s) => String(s === null || s === undefined ? "" : s),
      document: {
        readyState: "complete",
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
        addEventListener: () => {},
      },
    });
    vm.runInContext(PANEL, ctx, { filename: "admin-stripe-status.js" });
    return win.AdminStripeStatus.render(null, { endpoints: [{ url: "x", enabledEvents: [] }], verify });
  }

  test("台帳が読めなかったとき", () => {
    expect(render(null).indexOf("台帳を読めませんでした") >= 0).toBe(true);
  });

  test("まだ1件も無いとき、押す手順を出す", () => {
    const html = render({ recorded: false, okCount: 0, failCount: 0 });
    expect(html.indexOf("テストイベントを送信") >= 0).toBe(true);
  });

  test("全部失敗しているとき、原因と実害を出す", () => {
    const html = render({
      recorded: true, okCount: 0, failCount: 3,
      lastFailKind: "signature_mismatch", lastFailAt: "2026-10-25T04:00:00.000Z",
      lastFailMessage: "No signatures found",
    });
    expect(html.indexOf("誰が買っても権利は付きません") >= 0).toBe(true);
    expect(html.indexOf("whsec の取り違え") >= 0).toBe(true);
  });

  test("全部成功しているとき、一致していると言い切る", () => {
    const html = render({ recorded: true, okCount: 2, failCount: 0, lastOkAt: "2026-10-25T04:00:00.000Z" });
    expect(html.indexOf("whsec は一致しています") >= 0).toBe(true);
  });

  test("成功と失敗が混じるときは、両方の数を出す", () => {
    const html = render({ recorded: true, okCount: 5, failCount: 1, lastFailKind: "other" });
    expect(html.indexOf("成功 5 件、失敗 1 件") >= 0).toBe(true);
  });
});
