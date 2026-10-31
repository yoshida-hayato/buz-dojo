//
// 段位の見張り その1 (js/rank.js)。
//
// なぜ要るか: 2026-11-01 に測った。rank.js は547行で、33個の関数のどれも
// テストに1度も出てこなかった (785件中0件)。段位はホームのバナー・成績画面・
// 結果画面・科目カードの4箇所に出て、さらに Firestore の控え (rankName) に
// 焼かれるので、間違えると画面に残る。実際に3つ壊れていた。
//
// この1枚が見張るのは約束1だけ。残りは同じファイルに追記で足す。
//   (1) 読み込み済み科目のカードは、ホームのバナーと同じ段位を出す
//       (直す前: 記述式を触っていない SAP 利用者が バナー 六段 / カード 九段)
//
// 段の字面はドットでつないで書かない (Slack の自動リンクを避ける)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const APP_STATE = fs.readFileSync(path.join(ROOT, "js", "app-state.js"), "utf8");
const RANK = fs.readFileSync(path.join(ROOT, "js", "rank.js"), "utf8");
const KEY = "name";
const nameOf = (r) => (r && r[KEY]) || "";

// 件数は config/pricing.js の SUBJECT_CATALOG と同じ (段位は割合で決まる)
const SUBJECTS = {
  sap: 4951,
  "windows-shortcuts": 341,
  "biz-career": 823,
  "biz-pm-planning": 694,
  "biz-pm-operation": 295,
  "excel-functions": 150,
  "outlook-mail": 100,
  "teams-collab": 95,
  "ai-ontology-intro": 60,
  "ai-ontology-core": 107,
};

function subjectOf(id) {
  const src = fs.readFileSync(path.join(ROOT, "subjects", id, "subject.js"), "utf8");
  return vm.runInNewContext(src + NL + "; SUBJECT;", { Object, Array, String, Number });
}

// js/subject-config.js の applySubjectConfig と同じ組み立てを再現する
const APPLY =
  "CATEGORIES = Object.assign({}, SUBJECT.categories || {});" +
  "INPUT_CATEGORIES = new Set(SUBJECT.inputCategories || []);" +
  "RANKS = Array.isArray(SUBJECT.ranks) && SUBJECT.ranks.length" +
  " ? SUBJECT.ranks.slice() : DEFAULT_RANKS.slice();" +
  "if (INPUT_CATEGORIES.size === 0) { RANKS = RANKS.map(function (r) {" +
  " var c = Object.assign({}, r); delete c.inputCorrectRatio;" +
  " delete c.minInputAcc; delete c.minInputMasteredPct; return c; }); }" +
  "var ks = Object.keys(CATEGORIES);" +
  "QUIZ_DATA = Array.from({ length: TOTAL }, function (_, i) {" +
  " return { id: 'q' + i, category: ks[i % ks.length] }; });";

function load(id, total, loaded) {
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set,
    console: { warn: () => {}, error: () => {} },
    QuizStorage: { isChoiceMastered: (s) => (s && (s.k || 0) >= 2) || false },
    RECENT_ACCURACY_WINDOW: 500,
    RECENT_INPUT_ACCURACY_WINDOW: 100,
    escapeHtml: (x) => String(x),
    $: () => null,
    SUBJECT: subjectOf(id),
    TOTAL: total,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(APP_STATE, ctx);
  vm.runInContext(RANK, ctx);
  vm.runInContext("CURRENT_SUBJECT = " + (loaded ? "SUBJECT" : "null") + ";" + APPLY, ctx);
  return ctx;
}

const call = (ctx, expr, stats) =>
  vm.runInContext(expr.replace("ARG", JSON.stringify(stats)), ctx);

const cardOf = (ctx, id, total, stats) =>
  call(ctx, "getRankForContext(ARG, createPickerRankContext(" + total + ", " + JSON.stringify(id) + "))", stats);

describe("約束1: 読み込み済み科目のカードは、ホームのバナーと同じ段位を出す", () => {
  // 記述式の正答率は高いが習得数が足りない人を必ず混ぜる。
  // この人が居ないと、カードの記述式の分母が0に戻っても minInputAcc の側で
  // 偶然そろってしまい、見張りが素通りする (2026-11-01 に実測して足した)
  test("詳細が空で保存値だけ在る人でも一致する (SAP)", () => {
    const ctx = load("sap", 4951, true);
    for (const correct of [1000, 6000, 9000, 12000, 14853]) {
      for (const [ia, ic, mi] of [[0, 0, 0], [50, 45, 20], [400, 360, 300], [900, 800, 619], [900, 800, 9999]]) {
        const s = {
          answered: Math.round(correct / 0.86), correct,
          inputAnswered: ia, inputCorrect: ic,
          masteredChoice: 3300, masteredInput: mi, q: {},
        };
        const banner = nameOf(call(ctx, "getRank(ARG)", s));
        expect([correct, mi, nameOf(cardOf(ctx, "sap", 4951, s))]).toEqual([correct, mi, banner]);
      }
    }
  });
});
