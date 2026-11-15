//
// Entitlement を本物のまま走らせる足場。試験の中に置くと jest が
// 「試験が1件も無い」で落とすので、test-helpers に置く (2026-11-14 に
// 試験の1枚を追記の鎖で割って4件失って実測した)。
//
// 日次枠の鍵と控えの鍵は entitlement.js の中の定数なので、ここで同じ字を
// 持つ。食い違ったら使用量の seed が効かず、どの科目も「未使用」に見える
// (2026-11-15 に実測。失敗の型6 そのもので、最初はコードの不具合に見えた)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "js", "entitlement.js");
const pricing = require(path.join(ROOT, "config", "pricing.js"));
const NL = String.fromCharCode(10);

const USAGE_KEY = "biz_dojo_daily_usage_v1";
const CACHE_KEY = "biz_dojo_entitlements_v1";

function fakeStorage(seed) {
  const map = Object.assign({}, seed || {});
  return {
    map,
    getItem: (k) =>
      Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null,
    setItem: (k, v) => {
      map[k] = String(v);
    },
    removeItem: (k) => {
      delete map[k];
    },
  };
}

// src を渡せば別の版 (直す前のファイル) も同じ入力で走らせられる
function load(seed, src) {
  const storage = fakeStorage(seed);
  let emit = null;
  const firebase = {
    apps: [{}],
    auth: () => ({ currentUser: { email: "" } }),
    app: () => ({ functions: null }),
    firestore: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              onSnapshot: (next) => {
                emit = next;
                return () => {};
              },
            }),
          }),
        }),
      }),
    }),
  };
  const ctx = {
    console: { warn: () => {}, error: () => {}, log: () => {} },
    PricingConfig: pricing,
    localStorage: storage,
    firebase,
    window: {},
    Date, JSON, Intl, Math, Number, Object, Array, Set, String, Boolean,
  };
  ctx.window.localStorage = storage;
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(src || SRC, "utf8") + NL + ";globalThis.E = Entitlement;",
    ctx
  );
  return {
    ent: ctx.E,
    storage,
    snapshot: (data) => emit({ exists: data != null, data: () => data }),
  };
}

// 今日 (JST) の使用量を seed にする。{ 科目 id: 使った数 }
function usageSeed(rows) {
  const day = load().ent.jstDateKey();
  const map = {};
  Object.keys(rows || {}).forEach((k) => {
    map[k] = { date: day, count: rows[k] };
  });
  const out = {};
  out[USAGE_KEY] = JSON.stringify(map);
  return out;
}

// パック購入済みの控えを seed にする
function packSeed(uid) {
  const out = {};
  out[CACHE_KEY] = JSON.stringify({
    uid: uid,
    e: { pack: true, subjects: {} },
    savedAt: Date.now(),
  });
  return out;
}

module.exports = { load, usageSeed, packSeed, USAGE_KEY, CACHE_KEY };
