// 決済から戻った回を vm で再現するための足場。
// __tests__ の中に置くと jest が「テストが無いファイル」として落とすので、
// ここに置く (手元のランナーも、拾うのは test.js で終わる名前だけ)。
//
// 時計とタイマーは呼び手が進める。90秒の待ちを実時間で待たずに測れる。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "billing.js"),
  "utf8"
);
const PAY_URL = "checkout-session-url";
const GRANT_KEY = "biz_dojo_pending_grant_v1";

function el(tag) {
  return {
    tag: tag,
    id: "",
    className: "",
    type: "",
    textContent: "",
    attrs: {},
    kids: [],
    handlers: {},
    parentNode: null,
    setAttribute: function (k, v) { this.attrs[k] = v; },
    addEventListener: function (k, f) { this.handlers[k] = f; },
    appendChild: function (c) { c.parentNode = this; this.kids.push(c); return c; },
    removeChild: function (c) {
      this.kids = this.kids.filter(function (x) { return x !== c; });
      c.parentNode = null;
    },
  };
}

function text(node) {
  if (!node) return "";
  return (node.textContent || "") + node.kids.map(text).join(" ");
}

function boot(opts) {
  const o = opts || {};
  const timers = [];
  const events = [];
  const store = {};
  if (o.seed) store[GRANT_KEY] = JSON.stringify(o.seed);
  let clock = 1000;
  let ent = o.ent || { pack: false, subjects: {} };
  const body = el("body");
  const find = function (id) {
    let hit = null;
    const walk = function (n) {
      if (n.id === id) hit = n;
      n.kids.forEach(walk);
    };
    walk(body);
    return hit;
  };
  const ctx = vm.createContext({
    console,
    URLSearchParams,
    JSON,
    Object,
    alert: function () {},
    Date: { now: function () { return clock; } },
    sessionStorage: {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    },
    window: {
      location: { search: o.search || "", pathname: "/", hash: "", href: "" },
      setTimeout: function (f, ms) { timers.push({ f: f, at: clock + (ms || 0) }); },
      addEventListener: function () {},
      history: { replaceState: function () {} },
      URLSearchParams,
    },
    document: {
      readyState: "complete",
      body: body,
      addEventListener: function () {},
      createElement: el,
      getElementById: find,
    },
    firebase: {
      apps: [{}],
      functions: function () { return {}; },
      app: function () {
        return {
          functions: function () {
            return {
              httpsCallable: function () {
                return async function () { return { data: { url: PAY_URL } }; };
              },
            };
          },
        };
      },
      auth: function () { return { currentUser: { uid: "u1" } }; },
      analytics: function () {
        return { logEvent: function (n, p) { events.push({ name: n, params: p }); } };
      },
    },
    AppScripts: { ensureFirebaseFunctions: async function () {} },
    Entitlement: {
      isOneTime: function () { return true; },
      getEntitlements: function () { return ent; },
    },
  });
  ctx.globalThis = ctx;
  vm.runInContext(SRC + "\nglobalThis.__B = Billing;", ctx, { filename: "billing.js" });
  return {
    api: ctx.__B,
    events: events,
    store: store,
    names: function () { return events.map(function (e) { return e.name; }); },
    banner: function () { return find("grant-banner"); },
    grant: function (next) { ent = next; },
    tick: function (ms) {
      clock += ms;
      for (let i = 0; i < 400; i++) {
        const due = timers.filter(function (t) { return t.at <= clock; });
        if (!due.length) return;
        due.forEach(function (t) {
          timers.splice(timers.indexOf(t), 1);
          t.f();
        });
      }
    },
  };
}

module.exports = { boot, el, text, GRANT_KEY };
