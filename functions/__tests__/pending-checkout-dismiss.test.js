// ログインモーダルを閉じたときに、保留中の購入の意思が捨てられることの見張り。
//
// 未ログインで購入ボタンを押すと pendingAction が立ち、ログインモーダルが出る。
// 利用者がそのモーダルを閉じても pendingAction は残っていた。残ったまま、あとで
// 成績の保存など別の用でログインすると、onAuthStateChanged が
// resumePendingCheckout を呼び、頼んでいない決済画面に飛ばされる。
// 捨てる側 (auth.js の配線) は pending-checkout-wiring の1枚が見る。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "billing.js"),
  "utf8"
);

// 決済画面の行き先。ドットを含めるとテストの字面が URL に見えるので避ける。
const PAY_URL = "checkout-session-url";

function boot() {
  const nav = [];
  const opened = [];
  let user = null;
  const loc = {
    search: "",
    pathname: "/",
    hash: "",
    get href() {
      return "";
    },
    set href(v) {
      nav.push(v);
    },
  };
  const ctx = vm.createContext({
    console,
    URLSearchParams,
    alert: () => {},
    window: {
      location: loc,
      setTimeout: () => {},
      history: { replaceState: () => {} },
      URLSearchParams,
    },
    document: {
      readyState: "complete",
      addEventListener: () => {},
      getElementById: () => null,
    },
    firebase: {
      apps: [{}],
      functions: () => ({}),
      app: () => ({
        functions: () => ({
          httpsCallable: () => async () => ({ data: { url: PAY_URL } }),
        }),
      }),
      auth: () => ({ currentUser: user }),
      analytics: () => ({ logEvent: () => {} }),
    },
    AuthUI: { openModal: (o) => opened.push(o) },
    AppScripts: { ensureFirebaseFunctions: async () => {} },
    Entitlement: { isOneTime: () => true },
  });
  ctx.globalThis = ctx;
  vm.runInContext(SRC + "\nglobalThis.__B = Billing;", ctx, {
    filename: "billing.js",
  });
  return {
    api: ctx.__B,
    nav,
    opened,
    signIn: () => {
      user = { uid: "u1" };
      ctx.firebase.auth = () => ({ currentUser: user });
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

test("未ログインで購入を押すと、決済へは飛ばずログインモーダルが出る", async () => {
  const e = boot();
  await e.api.startCheckout("subject", "sap");
  expect(e.opened.length).toBe(1);
  expect(e.opened[0].reason).toBe("checkout");
  expect(e.nav.length).toBe(0);
});

test("モーダルを閉じて意思を捨てたら、あとのログインで決済画面に飛ばない", async () => {
  const e = boot();
  await e.api.startCheckout("subject", "sap");
  e.api.clearPendingCheckout();
  e.signIn();
  e.api.resumePendingCheckout();
  await settle();
  expect(e.nav).toEqual([]);
});

test("捨てていなければログインで決済画面に飛ぶ (再開そのものは生きている)", async () => {
  const e = boot();
  await e.api.startCheckout("subject", "sap");
  e.signIn();
  e.api.resumePendingCheckout();
  await settle();
  expect(e.nav).toEqual([PAY_URL]);
});

test("契約管理の保留も同じ1回で捨てられる", async () => {
  const e = boot();
  await e.api.openPortal();
  expect(e.opened.length).toBe(1);
  e.api.clearPendingCheckout();
  e.signIn();
  e.api.resumePendingCheckout();
  await settle();
  expect(e.nav).toEqual([]);
});
