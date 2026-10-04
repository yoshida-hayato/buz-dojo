// jest を入れられない環境 (npm が 403) で functions/__tests__ をそのまま走らせる最小ランナー。
// 使い方: node _dev/tools/jest-run.js  (全件) / 引数を付けるとファイル名に含む分だけ。
// いま使われている API だけを実装してある。CI の jest が正本。これは投稿前の自己点検用。
const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..", "..");
const TEST_DIR = path.join(ROOT, "functions", "__tests__");
const factories = new Map();
const mocked = new Map();

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (factories.has(request)) {
    if (!mocked.has(request)) mocked.set(request, factories.get(request)());
    return mocked.get(request);
  }
  return realLoad.call(this, request, parent, isMain);
};

function fn(impl) {
  const f = function () {
    f.mock.calls.push(Array.prototype.slice.call(arguments));
    return typeof f.impl === "function" ? f.impl.apply(this, arguments) : undefined;
  };
  f.mock = { calls: [] };
  f.impl = impl;
  f.mockImplementation = function (next) {
    f.impl = next;
    return f;
  };
  return f;
}

function resetModules() {
  mocked.clear();
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(ROOT) === 0 && k.indexOf("node_modules") < 0) delete require.cache[k];
  });
}

global.jest = {
  fn: fn,
  resetModules: resetModules,
  mock: function (name, factory) {
    factories.set(name, factory);
    mocked.delete(name);
  },
  spyOn: function (obj, key) {
    const original = obj[key];
    const spy = fn(typeof original === "function" ? original.bind(obj) : original);
    spy.mockRestore = function () { obj[key] = original; };
    obj[key] = spy;
    return spy;
  },
};

function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(function (k) { return same(a[k], b[k]); });
}

function show(v) {
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

const TABLE = {
  toBe: [function (g, w) { return g === w; }, "to be"],
  toEqual: [same, "to equal"],
  toContain: [function (g, w) { return g != null && g.indexOf(w) >= 0; }, "to contain"],
  toBeGreaterThan: [function (g, w) { return g > w; }, "to be above"],
  toBeGreaterThanOrEqual: [function (g, w) { return g >= w; }, "to be at least"],
  toBeLessThanOrEqual: [function (g, w) { return g <= w; }, "to be at most"],
  toBeUndefined: [function (g) { return g === undefined; }, "to be undefined"],
  toBeDefined: [function (g) { return g !== undefined; }, "to be defined"],
  toBeNull: [function (g) { return g === null; }, "to be null"],
  toBeTruthy: [function (g) { return !!g; }, "to be truthy"],
  toHaveBeenCalled: [function (g) { return !!(g && g.mock && g.mock.calls.length); }, "to have been called"],
};

function matchers(got, no) {
  const m = {};
  Object.keys(TABLE).forEach(function (name) {
    m[name] = function (want) {
      const ok = TABLE[name][0](got, want);
      if (no ? ok : !ok) {
        throw new Error("expected " + show(got) + (no ? " not " : " ") + TABLE[name][1] + " " + show(want));
      }
    };
  });
  if (!no) m.not = matchers(got, true);
  return m;
}

global.expect = function (got) { return matchers(got, false); };

let suites = [];
let current = null;

function makeTest(suite) {
  const add = function (name, body) { suite.tests.push({ name: name, body: body }); };
  add.each = function (rows) {
    return function (name, body) {
      rows.forEach(function (row) {
        const args = Array.isArray(row) ? row : [row];
        add(name + " " + show(args), function () {
          return body.apply(null, args);
        });
      });
    };
  };
  return add;
}

function enter(name, parent) {
  current = {
    name: name,
    tests: [],
    before: parent ? parent.before.slice() : [],
    after: parent ? parent.after.slice() : [],
  };
  suites.push(current);
  global.test = makeTest(current);
  global["it"] = global.test;
  return current;
}

global.describe = function (name, body) {
  const parent = current;
  enter(name, parent);
  body();
  current = parent;
  global.test = makeTest(parent);
  global["it"] = global.test;
};
global.beforeEach = function (h) { current.before.push(h); };
global.afterEach = function (h) { current.after.push(h); };
global.beforeAll = function (h) { h(); };
global.afterAll = function (h) { current.after.push(h); };

async function main() {
  const filter = process.argv[2] || "";
  const files = fs
    .readdirSync(TEST_DIR)
    .filter(function (f) {
      return f.endsWith(".test.js") && f.indexOf(filter) >= 0;
    })
    .sort();
  let pass = 0;
  const bad = [];
  for (const file of files) {
    suites = [];
    enter(file, null);
    factories.clear();
    resetModules();
    try {
      require(path.join(TEST_DIR, file));
    } catch (e) {
      bad.push(file + " 読み込みで失敗: " + e.message);
      continue;
    }
    for (const suite of suites.slice()) {
      for (const t of suite.tests) {
        try {
          for (const h of suite.before) await h();
          await t.body();
          for (const h of suite.after) await h();
          pass += 1;
        } catch (e) {
          bad.push(file + " / " + suite.name + " / " + t.name + ": " + e.message);
        }
      }
    }
  }
  console.log("files " + files.length + " / pass " + pass + " / fail " + bad.length);
  bad.forEach(function (b) { console.log("  FAIL " + b); });
  process.exitCode = bad.length > 0 ? 1 : 0;
}

main();
