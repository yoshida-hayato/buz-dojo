// 最小のテストランナー。jest が入らない環境で functions/__tests__ を走らせる。
//
// なぜ要るか: この箱から npm のレジストリに出られない (2026-11-01 は proxy が
// CONNECT に 403、2026-11-07 は名前解決そのものが通らない)。だから jest は
// 入らない。社員は便ごとに同じランナーを書き直していた (10/31, 11/1 に2回、
// 11/2 に1回)。package.json は 11月から test:mini でこのファイルを指していたが、
// ファイル自体が置かれていなかった。ここに置いて、書き直しを終わらせる。
//
// 使い方: リポジトリの根で node scripts/minijest.js [名前の一部]
//   jest の pretest と同じく _dev/sync-shared.py を先に走らせる
//   (忘れると料金の写しが古いまま通る。2026-11-01 に実測した取りこぼし)。
//
// なぜ正規表現を1つも使わないか: この repo の変更は Slack のパッチの口を通り、
// その口は円記号 (バックスラッシュ) を字面として運べない。だから改行は
// String.fromCharCode(10) で組み、照合は indexOf と split で書く。
// 同じ理由でバッククォートとアスタリスクも1文字も使わない。
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const child = require("child_process");

const ROOT = path.join(__dirname, "..");
const NL = String.fromCharCode(10);
const TEST_DIR = path.join(ROOT, "functions", "__tests__");

// ---- 木を組む ----------------------------------------------------------
function newNode(label) {
  return { label: label, tests: [], kids: [], before: [], after: [], once: [], onceAfter: [] };
}
let rootNode = newNode("");
let cursor = rootNode;

function describe(label, fn) {
  const node = newNode(label);
  cursor.kids.push(node);
  const prev = cursor;
  cursor = node;
  try {
    fn();
  } finally {
    cursor = prev;
  }
}

function test(label, fn) {
  cursor.tests.push({ label: label, fn: fn });
}

// jest の test.each。表の1行が配列ならそのまま引数、そうでなければ1引数。
function each(table) {
  return function (label, fn) {
    table.forEach(function (row) {
      const args = Array.isArray(row) ? row : [row];
      cursor.tests.push({ label: fmtName(label, args), fn: function () { return fn.apply(null, args); } });
    });
  };
}
test.each = each;
describe.each = function (table) {
  return function (label, fn) {
    table.forEach(function (row) {
      const args = Array.isArray(row) ? row : [row];
      describe(fmtName(label, args), function () { fn.apply(null, args); });
    });
  };
};

// 名前の中の %s などを引数で埋める。正規表現を使わずに1文字ずつ見る。
function fmtName(label, args) {
  const marks = "sdifjop";
  let out = "";
  let ai = 0;
  for (let i = 0; i < label.length; i += 1) {
    const c = label.charAt(i);
    if (c === "%" && i + 1 < label.length) {
      const n = label.charAt(i + 1);
      if (n === "%") { out += "%"; i += 1; continue; }
      if (marks.indexOf(n) >= 0) {
        out += show(args[ai]);
        ai += 1;
        i += 1;
        continue;
      }
    }
    out += c;
  }
  return out;
}

function show(v) {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  let s;
  try {
    s = JSON.stringify(v);
  } catch (e) {
    s = String(v);
  }
  if (s === undefined) s = String(v);
  return s.length > 240 ? s.slice(0, 240) + "..." : s;
}

// ---- 比べる ------------------------------------------------------------
function eq(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a !== a && b !== b;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
    if (!eq(a[ka[i]], b[ka[i]])) return false;
  }
  return true;
}

function matchers(actual, no) {
  function assert(ok, what, want) {
    if (no ? !ok : ok) return;
    const head = no ? "expect(受け取った値).not." : "expect(受け取った値).";
    throw new Error(head + what + NL + "  受け取った値: " + show(actual) + (want === undefined ? "" : NL + "  期待した値: " + show(want)));
  }
  const api = {
    toBe: function (v) { assert(actual === v || (actual !== actual && v !== v), "toBe", v); },
    toEqual: function (v) { assert(eq(actual, v), "toEqual", v); },
    toStrictEqual: function (v) { assert(eq(actual, v), "toStrictEqual", v); },
    toContain: function (v) {
      const ok = Array.isArray(actual) ? actual.indexOf(v) >= 0 : String(actual).indexOf(String(v)) >= 0;
      assert(ok, "toContain", v);
    },
    toContainEqual: function (v) {
      const ok = Array.isArray(actual) && actual.some(function (x) { return eq(x, v); });
      assert(ok, "toContainEqual", v);
    },
    toMatch: function (v) {
      const ok = typeof v === "string" ? String(actual).indexOf(v) >= 0 : v.test(String(actual));
      assert(ok, "toMatch", v);
    },
    toHaveLength: function (v) { assert(actual && actual.length === v, "toHaveLength", v); },
    toHaveProperty: function (k) { assert(actual != null && Object.prototype.hasOwnProperty.call(actual, k), "toHaveProperty", k); },
    toBeGreaterThan: function (v) { assert(actual > v, "toBeGreaterThan", v); },
    toBeGreaterThanOrEqual: function (v) { assert(actual >= v, "toBeGreaterThanOrEqual", v); },
    toBeLessThan: function (v) { assert(actual < v, "toBeLessThan", v); },
    toBeLessThanOrEqual: function (v) { assert(actual <= v, "toBeLessThanOrEqual", v); },
    toBeCloseTo: function (v, digits) {
      const d = digits === undefined ? 2 : digits;
      const diff = actual > v ? actual - v : v - actual;
      assert(diff < Math.pow(10, -d) / 2, "toBeCloseTo", v);
    },
    toBeDefined: function () { assert(actual !== undefined, "toBeDefined"); },
    toBeUndefined: function () { assert(actual === undefined, "toBeUndefined"); },
    toBeNull: function () { assert(actual === null, "toBeNull"); },
    toBeNaN: function () { assert(actual !== actual, "toBeNaN"); },
    toBeTruthy: function () { assert(!!actual, "toBeTruthy"); },
    toBeFalsy: function () { assert(!actual, "toBeFalsy"); },
    toBeInstanceOf: function (v) { assert(actual instanceof v, "toBeInstanceOf", v ? v["name"] : ""); },
    toThrow: function (want) {
      let threw = false;
      let msg = "";
      try {
        actual();
      } catch (e) {
        threw = true;
        msg = e && e.message ? e.message : String(e);
      }
      const ok = threw && (want === undefined || msg.indexOf(String(want)) >= 0);
      assert(ok, "toThrow", want);
    },
    toHaveBeenCalled: function () {
      assert(!!(actual && actual.mock) && actual.mock.calls.length > 0, "toHaveBeenCalled");
    },
    toHaveBeenCalledTimes: function (v) {
      assert(!!(actual && actual.mock) && actual.mock.calls.length === v, "toHaveBeenCalledTimes", v);
    },
    toHaveBeenCalledWith: function () {
      const want = Array.prototype.slice.call(arguments);
      const ok = !!(actual && actual.mock) && actual.mock.calls.some(function (c) { return eq(c, want); });
      assert(ok, "toHaveBeenCalledWith", want);
    },
  };
  return api;
}

function expect(actual) {
  const api = matchers(actual, false);
  api.not = matchers(actual, true);
  return api;
}
expect.any = function (ctor) { return { __any: ctor }; };

// ---- jest の代用 -------------------------------------------------------
let mockFactories = {};
let mockCache = {};

function makeMockFn(impl) {
  let body = impl;
  const fn = function () {
    const args = Array.prototype.slice.call(arguments);
    fn.mock.calls.push(args);
    const out = body ? body.apply(this, args) : undefined;
    fn.mock.results.push({ type: "return", value: out });
    return out;
  };
  fn._isMockFunction = true;
  fn.mock = { calls: [], results: [], instances: [] };
  fn.mockImplementation = function (f) { body = f; return fn; };
  fn.mockReturnValue = function (v) { body = function () { return v; }; return fn; };
  fn.mockReturnValueOnce = function (v) {
    const prev = body;
    let used = false;
    body = function () {
      if (!used) { used = true; return v; }
      return prev ? prev.apply(this, arguments) : undefined;
    };
    return fn;
  };
  fn.mockResolvedValue = function (v) { body = function () { return Promise.resolve(v); }; return fn; };
  fn.mockRejectedValue = function (v) { body = function () { return Promise.reject(v); }; return fn; };
  fn.mockClear = function () { fn.mock.calls = []; fn.mock.results = []; return fn; };
  fn.mockReset = function () { body = undefined; return fn.mockClear(); };
  return fn;
}

// 自分で読み込んだものだけ忘れる。node_modules とこのランナーは残す。
function resetModules() {
  Object.keys(require.cache).forEach(function (key) {
    if (key.indexOf(ROOT) !== 0) return;
    if (key.indexOf(path.join(ROOT, "node_modules")) === 0) return;
    if (key === __filename) return;
    delete require.cache[key];
  });
}

const jest = {
  fn: makeMockFn,
  // 依頼の字面で覚える。jest と違い、巻き上げはしない (呼ばれた時点から効く)。
  // 試験対象を require するのは mock の宣言より後なので、現にこれで足りる。
  mock: function (request, factory) {
    mockFactories[request] = factory || function () { return {}; };
    delete mockCache[request];
    resetModules();
  },
  unmock: function (request) { delete mockFactories[request]; delete mockCache[request]; },
  resetModules: resetModules,
  clearAllMocks: function () {},
  resetAllMocks: function () {},
  restoreAllMocks: function () {},
  spyOn: function (obj, name) {
    const orig = obj[name];
    const spy = makeMockFn(typeof orig === "function" ? orig.bind(obj) : undefined);
    spy.mockRestore = function () { obj[name] = orig; return spy; };
    obj[name] = spy;
    return spy;
  },
  setTimeout: function () {},
};

// require を横取りして、宣言された依頼を差し替える。
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mockFactories, request)) {
    // 1つの依頼に1つの実体を返す。毎回作り直すと、試験が覗く控えと
    // 試験対象が書き込む控えが別物になり、黙って undefined が出る
    // (2026-11-07 に6件これで落ちた)。
    if (!Object.prototype.hasOwnProperty.call(mockCache, request)) {
      const made = mockFactories[request];
      mockCache[request] = typeof made === "function" ? made() : made;
    }
    return mockCache[request];
  }
  return realLoad.apply(this, arguments);
};

// ---- 走らせる ----------------------------------------------------------
function isThenable(v) { return v && typeof v.then === "function"; }

async function callMaybeAsync(fn) {
  const out = fn();
  if (isThenable(out)) await out;
}

const counts = { files: 0, pass: 0, fail: 0, skipped: [] };
const failures = [];

async function walk(node, trail, chain) {
  const path2 = node.label ? trail.concat([node.label]) : trail;
  const stack = chain.concat([node]);
  for (const fn of node.once) await callMaybeAsync(fn);
  for (const t of node.tests) {
    const full = path2.concat([t.label]).join(" > ");
    try {
      for (const s of stack) for (const fn of s.before) await callMaybeAsync(fn);
      await callMaybeAsync(t.fn);
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        for (const fn of stack[i].after) await callMaybeAsync(fn);
      }
      counts.pass += 1;
    } catch (e) {
      counts.fail += 1;
      failures.push({ label: full, message: e && e.message ? e.message : String(e) });
    }
  }
  for (const kid of node.kids) await walk(kid, path2, stack);
  for (const fn of node.onceAfter) await callMaybeAsync(fn);
}

async function runFile(file) {
  rootNode = newNode("");
  cursor = rootNode;
  mockFactories = {};
  mockCache = {};
  resetModules();
  counts.files += 1;
  try {
    require(file);
  } catch (e) {
    counts.fail += 1;
    failures.push({ label: path.basename(file) + " (読み込み)", message: e && e.message ? e.message : String(e) });
    return;
  }
  await walk(rootNode, [path.basename(file)], []);
}

async function main() {
  const filter = process.argv[2] || "";
  // jest の pretest と同じ同期を先に走らせる。忘れると写しが古いまま通る。
  try {
    child.execFileSync("python3", [path.join(ROOT, "_dev", "sync-shared.py")], { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    process.stdout.write("sync-shared.py が走らなかった: " + (e && e.message ? e.message : String(e)) + NL);
  }
  const files = fs.readdirSync(TEST_DIR).filter(function (f) {
    return f.length > 8 && f.slice(-8) === ".test.js" && (!filter || f.indexOf(filter) >= 0);
  }).sort();
  for (const f of files) await runFile(path.join(TEST_DIR, f));
  process.stdout.write(NL);
  failures.forEach(function (f) {
    process.stdout.write("落ちた: " + f.label + NL + "  " + f.message.split(NL).join(NL + "  ") + NL + NL);
  });
  process.stdout.write(counts.files + "ファイル " + (counts.pass + counts.fail) + "件 / 通った " + counts.pass + " / 落ちた " + counts.fail + NL);
  process.exit(counts.fail > 0 ? 1 : 0);
}

global["describe"] = describe;
global["test"] = test;
global["it"] = test;
global["expect"] = expect;
global["jest"] = jest;
global["beforeEach"] = function (fn) { cursor.before.push(fn); };
global["afterEach"] = function (fn) { cursor.after.push(fn); };
global["beforeAll"] = function (fn) { cursor.once.push(fn); };
global["afterAll"] = function (fn) { cursor.onceAfter.push(fn); };

main();
