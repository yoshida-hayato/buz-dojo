// 本物の js/storage.js を vm で走らせる器。混入検出の2枚が使う。
// source を渡すと、その字面を本物の代わりに走らせる (壊し方の確かめ用)。
// 字面が在ることを見るのではなく、抜いたコードを実際に走らせるための足場である。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const STORAGE = fs.readFileSync(path.join(ROOT, "js", "storage.js"), "utf8");

const PATTERN = [true, true, false, true, true, true, false, true, true, true];
const ID_PERIOD = 40;
const KEY_FEB = "biz_dojo_fe_kamoku_b_stats_v1";
const KEY_APB = "biz_dojo_ap_kamoku_b_stats_v1";
const KEY_SAP = "biz_dojo_sap_stats_v1";

function makeStore(subjectId, localMap, source) {
  const ctx = {
    console: { warn() {}, error() {}, log() {}, info() {} },
    JSON, Object, Array, Number, String, Math, Set, Map, Date,
  };
  vm.createContext(ctx);
  vm.runInContext((source || STORAGE) + NL + ";globalThis.__S = QuizStorage;", ctx);
  const S = ctx.__S;
  S.subjectId = subjectId;
  S.stats = S._empty();
  S._persist = function () {};
  S._syncRankSnapshot = function () {};
  S._touchLocalSummaryCache = function () {};
  // 本番は端末の控えから他科目の全成績 (q 入り) が読める。その口を模す
  S._loadFromKey = function (key) {
    if (localMap && localMap[key]) return localMap[key];
    return this._empty();
  };
  return S;
}

function summaryOf(S) {
  return {
    answered: S.stats.answered,
    correct: S.stats.correct,
    masteredChoice: S.stats.masteredChoice,
    masteredInput: S.stats.masteredInput || 0,
    inputAnswered: S.stats.inputAnswered || 0,
  };
}

// rounds 問を2科目に交互に積む。sameIds なら両方が同じ問題 id を持つ (本当の写し)
function play(rounds, sameIds, source) {
  const localMap = {};
  const a = makeStore("fe-kamoku-b", localMap, source);
  const b = makeStore("ap-kamoku-b", localMap, source);
  for (let i = 0; i < rounds; i++) {
    const ok = PATTERN[i % PATTERN.length];
    const n = i % ID_PERIOD;
    a.record(sameIds ? "same-" + n : "feb-" + n, ok, false, "fe-kamoku-b");
    b.record(sameIds ? "same-" + n : "apb-" + n, ok, false, "ap-kamoku-b");
  }
  localMap[KEY_FEB] = a.stats;
  localMap[KEY_APB] = b.stats;
  return { a, b, localMap };
}

// 2科目のうち、混入と判定されて空に戻される科目の数
function wipedCount(rounds, sameIds, source) {
  const r = play(rounds, sameIds, source);
  const pa = r.a._looksLikeCrossSubjectPollution("fe-kamoku-b", r.a.stats, {
    "ap-kamoku-b": summaryOf(r.b),
  });
  const pb = r.b._looksLikeCrossSubjectPollution("ap-kamoku-b", r.b.stats, {
    "fe-kamoku-b": summaryOf(r.a),
  });
  return (pa ? 1 : 0) + (pb ? 1 : 0);
}

// 累計だけが他科目のものに膨らんだ事故。q は自分のぶんしか無い
function counterOnlyCopy(source) {
  const localMap = {};
  const victim = makeStore("ap-kamoku-b", localMap, source);
  for (let i = 0; i < 130; i++) {
    victim.record("apb-" + (i % ID_PERIOD), PATTERN[i % PATTERN.length], false, "ap-kamoku-b");
  }
  const peer = makeStore("sap", localMap, source);
  for (let i = 0; i < 400; i++) {
    peer.record("t-" + (i % 200), PATTERN[i % PATTERN.length], false, "sap");
  }
  localMap[KEY_SAP] = peer.stats;
  victim.stats.answered = peer.stats.answered;
  victim.stats.correct = peer.stats.correct;
  victim.stats.masteredChoice = peer.stats.masteredChoice;
  return {
    victim,
    peer,
    verdict() {
      return victim._looksLikeCrossSubjectPollution("ap-kamoku-b", victim.stats, {
        sap: summaryOf(peer),
      });
    },
  };
}

module.exports = {
  STORAGE, PATTERN, ID_PERIOD, KEY_FEB, KEY_APB, KEY_SAP,
  makeStore, summaryOf, play, wipedCount, counterOnlyCopy,
};
