// 本物の js/storage.js を vm で走らせる器。他科目の成績の書き分けの見張りが使う。
// source を渡すと、その字面を本物の代わりに走らせる (壊し方の確かめ用)。
// 字面が在ることを見るのではなく、抜いたコードを実際に走らせるための足場である。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const STORAGE = fs.readFileSync(path.join(ROOT, "js", "storage.js"), "utf8");
const ENGINE = fs.readFileSync(path.join(ROOT, "js", "quiz-engine.js"), "utf8");

const KEY = {
  "ap-kamoku-b": "biz_dojo_ap_kamoku_b_stats_v1",
  "fe-kamoku-b": "biz_dojo_fe_kamoku_b_stats_v1",
  sap: "biz_dojo_sap_stats_v1",
};

// 開いている科目を1つ持つ器を作る。端末の控えは written に溜まる。
// 段位の塗り直しと控えの要約は QUIZ_DATA と SubjectSummary が要るので、
// 呼ばれた回数だけを数える形にして実体は黙らせる。
function makeStore(openSubjectId, options) {
  const opts = options || {};
  const written = opts.written || {};
  const said = [];
  const cloud = [];
  const summaries = [];
  const ctx = {
    console: {
      warn: (m, d) => said.push({ message: String(m), detail: d }),
      error() {},
      log() {},
      info() {},
    },
    JSON, Object, Array, Number, String, Math, Set, Map, Date,
    localStorage: {
      getItem: (k) => (k in written ? written[k] : null),
      setItem: (k, v) => { written[k] = String(v); },
      removeItem: (k) => { delete written[k]; },
    },
    navigator: { onLine: true },
  };
  vm.createContext(ctx);
  vm.runInContext((opts.source || STORAGE) + NL + ";globalThis.__S = QuizStorage;", ctx);
  const S = ctx.__S;
  S.useSubject(openSubjectId, KEY[openSubjectId] || null);
  S.mode = opts.mode || "local";
  S._syncRankSnapshot = function () {};
  S._touchLocalSummaryCache = function () {};
  S._todayKey = function () { return "2026-11-15"; };
  S._cloudSaveAsyncForSubject = function (subjectId, stats) {
    cloud.push({ subjectId: String(subjectId), answered: Number(stats && stats.answered) || 0 });
    return Promise.resolve(true);
  };
  S.__written = written;
  S.__said = said;
  S.__cloud = cloud;
  S.__summaries = summaries;
  S.__setSummarySpy = function () {
    ctx.SubjectSummary = {
      setLocal: (id, sum) => summaries.push({ subjectId: String(id), answered: Number(sum && sum.answered) || 0 }),
      fromStats: (st) => ({ answered: Number(st && st.answered) || 0 }),
      normalize: (d) => d || {},
    };
  };
  return S;
}

// 控えに残っている科目ごとの件数。鍵の名前つきで返す。
function tallyOf(S) {
  const out = {};
  Object.keys(S.__written).forEach((k) => {
    if (k.indexOf("stats_v1") < 0) return;
    let v = null;
    try { v = JSON.parse(S.__written[k]); } catch (e) { v = null; }
    if (!v) return;
    out[k] = {
      answered: Number(v.answered) || 0,
      correct: Number(v.correct) || 0,
      ids: Object.keys(v.q || {}).length,
      masteredChoice: Number(v.masteredChoice) || 0,
    };
  });
  return out;
}

// MixScreen が組む枠を模した10問。開いている科目が8問、他科目が2問。
const SLOTS = [
  { subjectId: "ap-kamoku-b", id: "apb-1" },
  { subjectId: "sap", id: "t-1" },
  { subjectId: "ap-kamoku-b", id: "apb-2" },
  { subjectId: "fe-kamoku-b", id: "feb-1" },
  { subjectId: "ap-kamoku-b", id: "apb-3" },
  { subjectId: "ap-kamoku-b", id: "apb-4" },
  { subjectId: "ap-kamoku-b", id: "apb-5" },
  { subjectId: "ap-kamoku-b", id: "apb-6" },
  { subjectId: "ap-kamoku-b", id: "apb-7" },
  { subjectId: "ap-kamoku-b", id: "apb-8" },
];

// 枠を順に答える。allowForeign を渡さなければ本番の通常出題と同じ呼び方になる。
function playSlots(S, options) {
  const opts = options || {};
  const slots = opts.slots || SLOTS;
  slots.forEach((slot, i) => {
    const ok = opts.allCorrect === true ? true : i % 3 !== 2;
    const isInput = !!opts.isInput;
    if (opts.allowForeign) {
      S.record(slot.id, ok, isInput, slot.subjectId, { allowForeign: true });
    } else {
      S.record(slot.id, ok, isInput, slot.subjectId);
    }
  });
  return tallyOf(S);
}

function sumAnswered(tally) {
  return Object.keys(tally).reduce((n, k) => n + tally[k].answered, 0);
}

module.exports = {
  STORAGE, ENGINE, KEY, SLOTS,
  makeStore, playSlots, tallyOf, sumAnswered,
};
