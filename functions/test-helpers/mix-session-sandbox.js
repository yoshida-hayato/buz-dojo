//
// MixSession を本物のまま走らせる足場。偽の読み口は、同時に何本走ったかを
// 自分で数える (直列で読むことが約束なので、字面ではなく走り方で見る)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);

function load() {
  const sandbox = {
    String, Number, Array, Object, JSON, Set, Map, Promise, Date, Error, Boolean,
    console: { warn: () => {}, error: () => {}, log: () => {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "js", "mix-session.js"), "utf8"),
    ctx
  );
  return vm.runInContext("MixSession", ctx);
}

// 偽の科目データ。count 問ぶんの entries を持つ束を返す
function bundle(id, count) {
  const quiz = [];
  for (let i = 1; i <= count; i++) {
    quiz.push({ id: id + "-" + i, category: "scenario", priority: 1 });
  }
  return { quiz: quiz, judgment: [], order: [], contrast: [] };
}

// rows: { 科目 id: 問題数 }。値が文字なら、その理由で投げる。
// 返り値の calls は呼ばれた順、maxInFlight は同時に走った本数の最大。
function fakeLoader(rows, delayMs) {
  const state = { calls: [], inFlight: 0, maxInFlight: 0 };
  const fn = function (id) {
    state.calls.push(id);
    state.inFlight++;
    if (state.inFlight > state.maxInFlight) state.maxInFlight = state.inFlight;
    return new Promise(function (resolve, reject) {
      const finish = function () {
        state.inFlight--;
        const v = rows[id];
        if (v === undefined) reject(new Error("科目が見つかりません: " + id));
        else if (typeof v === "string") reject(new Error(v));
        else resolve(bundle(id, v));
      };
      if (delayMs) setTimeout(finish, delayMs);
      else Promise.resolve().then(finish);
    });
  };
  fn.state = state;
  return fn;
}

// 成績の集合を返す偽の口。seen に聞かれた科目を順に積む
function fakeSets(rows) {
  const seen = [];
  const fn = function (id) {
    seen.push(id);
    const r = (rows || {})[id] || {};
    return {
      choiceMastered: new Set(r.choiceMastered || []),
      inputMastered: new Set(r.inputMastered || []),
      wrongIds: new Set(r.wrongIds || []),
      answeredIds: new Set(r.answeredIds || []),
    };
  };
  fn.seen = seen;
  return fn;
}

function recorder() {
  const events = [];
  const fn = function (e) {
    events.push(e);
  };
  fn.events = events;
  fn.phases = function () {
    return events.map((e) => e.phase).join(" ");
  };
  return fn;
}

module.exports = { load, bundle, fakeLoader, fakeSets, recorder, NL };
