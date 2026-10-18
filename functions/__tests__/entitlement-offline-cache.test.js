// 購読状態のローカル控えのガード。
//
// cloudEntitlements は Firestore の onSnapshot だけが書き、初期値は null。
// 起動から最初のスナップショットが着くまでの間、買った人も hasAccess が
// false になり 1日20問の壁が出る。回線が無い間はそれが永久に続く。
// (2026-10-18 10:48便: オフラインモードの前提条件を調べて見つけた)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");
const ENTITLEMENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const CACHE_KEY = "biz_dojo_entitlements_v1";
const PAID = "windows-shortcuts";

function fakeStorage(seed) {
  const map = Object.assign({}, seed || {});
  return {
    map,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    },
    removeItem: (k) => {
      delete map[k];
    },
  };
}

function load(opts) {
  const o = opts || {};
  const storage = fakeStorage(o.seed);
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
    console,
    PricingConfig: pricing,
    localStorage: storage,
    firebase,
    window: {},
    Date,
    JSON,
    Intl,
    Math,
    Number,
    Object,
    Array,
    Set,
  };
  ctx.window.localStorage = storage;
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(ENTITLEMENT_SRC, "utf8") + "\n;globalThis.Entitlement = Entitlement;",
    ctx
  );
  return {
    ent: ctx.Entitlement,
    storage,
    snapshot: (data) => emit({ exists: data != null, data: () => data }),
  };
}

function seedCache(uid, e, ageMs) {
  const row = { uid: uid, e: e, savedAt: Date.now() - (ageMs || 0) };
  return { [CACHE_KEY]: JSON.stringify(row) };
}

describe("購読状態のローカル控え", () => {
  test("スナップショットが着いたら控える", () => {
    const h = load();
    h.ent.startSync("uid-1");
    h.snapshot({ pack: true, subjects: {} });
    const row = JSON.parse(h.storage.getItem(CACHE_KEY));
    expect(row.uid).toBe("uid-1");
    expect(row.e.pack).toBe(true);
    expect(typeof row.savedAt).toBe("number");
  });

  test("控えがあれば、スナップショットが来る前から購入済みとして扱う", () => {
    const h = load({ seed: seedCache("uid-1", { pack: true, subjects: {} }) });
    expect(h.ent.hasAccess(PAID)).toBe(false);
    h.ent.startSync("uid-1");
    expect(h.ent.hasAccess(PAID)).toBe(true);
    expect(h.ent.remainingFree(PAID)).toBe(Infinity);
  });

  test("uid が違う控えは使わない", () => {
    const h = load({ seed: seedCache("uid-other", { pack: true, subjects: {} }) });
    h.ent.startSync("uid-1");
    expect(h.ent.hasAccess(PAID)).toBe(false);
  });

  test("期限切れの控えは使わない", () => {
    const old = 31 * 24 * 60 * 60 * 1000;
    const h = load({ seed: seedCache("uid-1", { pack: true, subjects: {} }, old) });
    h.ent.startSync("uid-1");
    expect(h.ent.hasAccess(PAID)).toBe(false);
  });

  test("壊れた控えでも落ちない", () => {
    const h = load({ seed: { [CACHE_KEY]: "{" } });
    h.ent.startSync("uid-1");
    expect(h.ent.hasAccess(PAID)).toBe(false);
  });

  test("クラウドが着いたら控えより新しい方が勝つ (解約・返金が効く)", () => {
    const h = load({ seed: seedCache("uid-1", { pack: true, subjects: {} }) });
    h.ent.startSync("uid-1");
    expect(h.ent.hasAccess(PAID)).toBe(true);
    h.snapshot({ pack: false, subjects: {} });
    expect(h.ent.hasAccess(PAID)).toBe(false);
    expect(JSON.parse(h.storage.getItem(CACHE_KEY)).e.pack).toBe(false);
  });

  test("単品の控えも効く", () => {
    const seed = seedCache("uid-1", { pack: false, subjects: { [PAID]: { status: "active" } } });
    const h = load({ seed: seed });
    h.ent.startSync("uid-1");
    expect(h.ent.hasAccess(PAID)).toBe(true);
  });

  test("控えの鍵を読み書きしているのは js/entitlement.js だけ", () => {
    const jsDir = path.join(__dirname, "..", "..", "js");
    const hits = fs
      .readdirSync(jsDir)
      .filter((f) => f.endsWith(".js"))
      .filter((f) => fs.readFileSync(path.join(jsDir, f), "utf8").includes(CACHE_KEY));
    expect(hits).toEqual(["entitlement.js"]);
  });
});
