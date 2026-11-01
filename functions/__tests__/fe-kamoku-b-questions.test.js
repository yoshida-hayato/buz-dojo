// 自前の問題データ (data/fe-kamoku-b/questions.js) の見張り。
//
// なぜ要るか: この科目だけは問題データもこの repo に在る。よその repo の
// マスタと違って、こちらが書き足すたびに壊せる。しかも科目カードの
// 全N問 は config/pricing.js の静的な questionCount から出るので
// (master が無いので問い合わせ先が無い)、問題を足して questionCount を
// 直し忘れると、カードが黙って嘘をつく。
//
// もう1つ: この repo の変更は Slack のパッチの口を通る。その口は
// バッククォートとアスタリスクと円記号を字面として運べない。問題文の
// コード囲みはバッククォート3個なので、文字コードから組んでいる。
// その約束が崩れた (誰かが素のバッククォートを書いた) ことも、ここで見る。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SUBJECT_ID = "fe-kamoku-b";
const DATA_REL = path.join("data", SUBJECT_ID, "questions.js");
const SRC = read(DATA_REL);
const SUBJECT_SRC = read(path.join("subjects", SUBJECT_ID, "subject.js"));

const pricing = require("../../config/pricing.js");
const statsPaths = require("../question-stats-paths");

const BACKTICK = String.fromCharCode(96);
const STAR = String.fromCharCode(42);
const YEN = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);

// 問題データを、本番と同じ読み方 (隔離した器で評価) で取り出す。
function loadQuiz() {
  const sandbox = { String, Array, Object, JSON, Math };
  vm.createContext(sandbox);
  return vm.runInContext(SRC + NL + ";QUIZ_DATA;", sandbox, { filename: "questions" });
}

// subject.js から宣言の一覧を取り出す。中かっこの中のキーだけを見る。
function declaredKeys(key) {
  const at = SUBJECT_SRC.indexOf(NL + "  " + key + ": {");
  if (at < 0) return [];
  const open = SUBJECT_SRC.indexOf("{", at);
  const close = SUBJECT_SRC.indexOf(NL + "  }", open);
  if (open < 0 || close < 0) return [];
  const body = SUBJECT_SRC.slice(open + 1, close);
  const out = [];
  body.split(NL).forEach(function (line) {
    const t = line.trim();
    if (!t || t.indexOf("//") === 0) return;
    const colon = t.indexOf(":");
    if (colon <= 0) return;
    out.push(t.slice(0, colon).trim().split('"').join(""));
  });
  return out;
}

const QUIZ = loadQuiz();

describe("自前の問題データが読める形で在る", () => {
  test("隔離した器で評価して、配列が取れる", () => {
    expect(Array.isArray(QUIZ)).toBe(true);
    expect(QUIZ.length).toBeGreaterThan(0);
  });

  test("件数が config/pricing.js の questionCount と一致する", () => {
    // 直し方: 問題を足したら config/pricing.js の questionCount も直す。
    //   ここがずれると科目カードの 全N問 が嘘になる (master が無いので
    //   静的な値がそのまま画面に出る)。
    expect(QUIZ.length).toBe(Number(pricing.SUBJECT_CATALOG[SUBJECT_ID].questionCount));
  });

  test("問題数が無料の上限を超えていない (超える日は値付けを決め直す)", () => {
    // 100問を超えると自作問題として有料になる。超えること自体は悪くないが、
    // 無料で出すつもりのまま超えると、黙って金を取る画面になる。
    expect(QUIZ.length).toBeLessThanOrEqual(100);
    expect(pricing.priceForSubject(SUBJECT_ID)).toBe(0);
  });
});

describe("1問ずつの形がそろっている", () => {
  test("id が重複せず、全部この科目の接頭で始まる", () => {
    const seen = {};
    const bad = [];
    QUIZ.forEach(function (q) {
      if (!q || !q.id) bad.push("no-id");
      else if (seen[q.id]) bad.push("dup:" + q.id);
      else seen[q.id] = true;
      if (q && q.id && q.id.indexOf("feb-") !== 0) bad.push("prefix:" + q.id);
    });
    expect(bad.join(",")).toBe("");
  });

  test("id から科目を当てる表が、この科目を指す", () => {
    // 接頭の表に feb- が無いと、成績の集計が既定の科目に流れ込む。
    const wrong = QUIZ.filter(function (q) {
      return statsPaths.guessSubjectId(q.id) !== SUBJECT_ID;
    }).map(function (q) {
      return q.id;
    });
    expect(wrong.join(",")).toBe("");
  });

  test("肢は4つで、同じ字面が2つ無い", () => {
    const bad = [];
    QUIZ.forEach(function (q) {
      if (!Array.isArray(q.choices) || q.choices.length !== 4) {
        bad.push("count:" + q.id);
        return;
      }
      const seen = {};
      q.choices.forEach(function (c) {
        if (typeof c !== "string" || !c.length) bad.push("empty:" + q.id);
        if (seen[c]) bad.push("dup:" + q.id);
        seen[c] = true;
      });
    });
    expect(bad.join(",")).toBe("");
  });

  test("問題文と解説が空でない", () => {
    const thin = QUIZ.filter(function (q) {
      return !q.name || q.name.length < 10 || !q.explanation || q.explanation.length < 20;
    }).map(function (q) {
      return q.id;
    });
    expect(thin.join(",")).toBe("");
  });

  test("分類と分野が subject.js の宣言に在る", () => {
    // 宣言に無い分類の問題は、出題設定でどの枠にも入らないので出ない。
    // 宣言に無い分野は、成績の分野別で見出しが空になる。
    const cats = declaredKeys("categories");
    const mods = declaredKeys("modules");
    expect(cats.length).toBeGreaterThan(0);
    expect(mods.length).toBeGreaterThan(0);
    const bad = [];
    QUIZ.forEach(function (q) {
      if (cats.indexOf(q.category) < 0) bad.push("cat:" + q.id + ":" + q.category);
      if (mods.indexOf(q.module) < 0) bad.push("mod:" + q.id + ":" + q.module);
    });
    expect(bad.join(",")).toBe("");
  });

  test("宣言した分野すべてに問題が1問以上在る", () => {
    // 空の分野を宣言すると、絞りに出るのに1問も出ない枠ができる。
    const used = {};
    QUIZ.forEach(function (q) {
      used[q.module] = true;
    });
    const empty = declaredKeys("modules").filter(function (m) {
      return !used[m];
    });
    expect(empty.join(",")).toBe("");
  });
});
