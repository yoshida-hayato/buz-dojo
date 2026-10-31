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

// 問題別の詳細 (q) とサマリの数を食い違わせない。本物の summary は reconcile 済み
function statsOf(ctx, masteredFrac, capFrac, inputFrac) {
  const all = vm.runInContext("QUIZ_DATA.map(function (q) { return q.id; })", ctx);
  const inputIds = vm.runInContext(
    "QUIZ_DATA.filter(function (q) { return INPUT_CATEGORIES.has(q.category); })" +
      ".map(function (q) { return q.id; })",
    ctx
  );
  const isInput = new Set(inputIds);
  const choice = all.filter((x) => !isInput.has(x));
  const mN = Math.floor(choice.length * masteredFrac);
  const iN = Math.floor(inputIds.length * inputFrac);
  const q = {};
  for (let i = 0; i < mN; i += 1) q[choice[i]] = { a: 2, c: 2, k: 2 };
  for (let i = 0; i < iN; i += 1) q[inputIds[i]] = { a: 2, c: 2, k: 2, ia: 2, ik: 2 };
  let have = (mN + iN) * 2;
  const cap = all.length * 3;
  const want = Math.floor(cap * capFrac);
  let i = mN;
  while (have < want && i < choice.length) {
    q[choice[i]] = { a: 1, c: 1, k: 1 };
    have += 1;
    i += 1;
  }
  return {
    answered: Math.round(have / 0.86) + 1,
    correct: have,
    inputAnswered: iN * 2,
    inputCorrect: iN * 2,
    masteredChoice: mN + iN,
    masteredInput: iN,
    q,
  };
}

const LEVELS = [
  [0.1, 0.1, 0], [0.3, 0.3, 0], [0.55, 0.55, 0],
  [0.7, 0.7, 0], [0.85, 0.85, 0], [1, 1, 0],
  [0.85, 0.85, 0.5], [1, 1, 1],
];

describe("約束1: 読み込み済み科目のカードは、ホームのバナーと同じ段位を出す", () => {
  for (const [id, total] of Object.entries(SUBJECTS)) {
    test(id, () => {
      const ctx = load(id, total, true);
      for (const [m, c, ip] of LEVELS) {
        const s = statsOf(ctx, m, c, ip);
        const banner = nameOf(call(ctx, "getRank(ARG)", s));
        expect([id, m, c, ip, nameOf(cardOf(ctx, id, total, s))]).toEqual([id, m, c, ip, banner]);
      }
    });
  }
});

describe("約束2: 習得数は現存する問題数を超えない", () => {
  // 旧マスタの問題IDで積まれた保存値は、問題が減った科目で分母を超える。
  // 超えたまま出すと成績画面に 5071 / 4951 や 9999 / 619 が並ぶ (実測)
  for (const [id, total] of Object.entries(SUBJECTS)) {
    test(id, () => {
      const ctx = load(id, total, true);
      const inputTotal = vm.runInContext("tcodeQuestionCount()", ctx);
      const s = {
        answered: 1200, correct: 1000, inputAnswered: 200, inputCorrect: 150,
        masteredChoice: total + 500, masteredInput: 9999, q: {},
      };
      expect(call(ctx, "masteredCount(ARG)", s)).toBeLessThanOrEqual(total);
      expect(call(ctx, "inputMasteredCount(ARG)", s)).toBeLessThanOrEqual(inputTotal);
    });
  }
});

describe("約束3: 昇段条件の記述式習得は、getRank が使った数で書く", () => {
  // 直す前: getRank は保存値300で七段の条件を満たしたと判定しながら、
  // 同じバナーの条件行は q から数え直して あと124問 と出し、帯を0パーセントにした
  test("保存値だけで条件を満たしている人に あと124問 と出さない", () => {
    const ctx = load("sap", 4951, true);
    const s = {
      answered: 9000, correct: 7500, inputAnswered: 900, inputCorrect: 700,
      masteredChoice: 3300, masteredInput: 300, q: {},
    };
    const p = call(ctx, "rankProgress(ARG)", s);
    const row = p.conditions.filter((c) => c.label === "記述式習得")[0];
    expect(Boolean(row)).toBe(true);
    expect(row.met).toBe(true);
    expect(p.pct).toBeGreaterThan(0);
  });
});

describe("約束4: minAcc を書き忘れた段を、黙って到達不能にしない", () => {
  // 科目を足す人が手で段位表を書く日に踏む形。acc >= r.minAcc は
  // minAcc が無いと必ず偽になり、その段から上が永久に止まる
  test("minAcc の無い段にも届く", () => {
    const ctx = load("biz-career", 823, true);
    vm.runInContext(
      "RANKS = DEFAULT_RANKS.slice(0, 12).map(function (r) {" +
        " var c = Object.assign({}, r); delete c.minAcc; return c; });",
      ctx
    );
    const s = {
      answered: 1200, correct: 1000, inputAnswered: 0, inputCorrect: 0,
      masteredChoice: 200, masteredInput: 0, q: {},
    };
    expect(nameOf(call(ctx, "getRank(ARG)", s))).toBe("二段");
  });
});

describe("約束5: getRank は汎用段位の記述式の門を見る", () => {
  // 記述式を持つ科目に汎用段位を使うと、記述式の門は inputCorrectRatio で書かれる。
  // 11本目を足した日に踏む形なので、いまの10科目では効かない式を直に測る。
  function ctxWithInput() {
    const ctx = load("biz-career", 823, true);
    vm.runInContext("INPUT_CATEGORIES = new Set(['term']); RANKS = DEFAULT_RANKS.slice();", ctx);
    return ctx;
  }
  const base = {
    answered: 1647, correct: 1400, inputAnswered: 10, inputCorrect: 9,
    masteredChoice: 500, masteredInput: 0, q: {},
  };

  test("汎用段位は記述式の門を持っている (前提の確認)", () => {
    const ctx = ctxWithInput();
    expect(
      vm.runInContext("RANKS.filter(function (r) { return r.inputCorrectRatio; }).length", ctx)
    ).toBeGreaterThan(0);
    expect(vm.runInContext("rankMinInputCorrect({ inputCorrectRatio: 0.05 })", ctx)).toBe(42);
  });

  test("記述式の正解が足りない人は、門を持つ段に届かない", () => {
    const ctx = ctxWithInput();
    const got = call(ctx, "getRank(ARG)", base);
    const need = vm.runInContext("rankMinInputCorrect(" + JSON.stringify(got) + ")", ctx);
    expect([nameOf(got), need]).toEqual(["六段", 0]);
    expect(need).toBeLessThanOrEqual(base.inputCorrect);
  });

  test("記述式の正解が足りれば、門を持つ段に届く (塞ぎっぱなしにしない)", () => {
    const ctx = ctxWithInput();
    const s = Object.assign({}, base, { inputAnswered: 50, inputCorrect: 45 });
    expect(nameOf(call(ctx, "getRank(ARG)", s))).toBe("七段");
  });
});
