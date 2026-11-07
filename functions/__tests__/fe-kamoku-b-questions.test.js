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

// 問題を足す日の窓。1件のパッチは追加+削除で200行までなので、問題を
// 何問も足す便は、件数が pricing の questionCount と一致しない中間の状態を
// 必ず通る。その間だけ true にし、pricing を直したら false に戻すこと。
// 窓が開いているあいだ、件数の食い違いは1つも検出されない。
// 開けたまま便を終わらせないこと (2026-11-07 に、この形で24問を足した)。
const FEB_COUNT_WINDOW_OPEN = false;

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
    // 窓については FEB_COUNT_WINDOW_OPEN の註を読むこと。
    if (FEB_COUNT_WINDOW_OPEN) return;
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

describe("パッチの口を通る字面だけで書かれている", () => {
  test("素のバッククォートもアスタリスクも円記号も無い", () => {
    // 直し方: コード囲みは febCode()、改行は febText() を使う。
    //   どちらも String.fromCharCode から組んでいる。
    //   ここに素の記号を書くと、次に同じファイルを直すパッチが
    //   Slack の変換で壊れて、原因の分からない形で破棄される。
    expect(SRC.indexOf(BACKTICK)).toBe(-1);
    expect(SRC.indexOf(STAR)).toBe(-1);
    expect(SRC.indexOf(YEN)).toBe(-1);
  });

  test("文字コードから組む足場が在る", () => {
    expect(SRC.indexOf("String.fromCharCode(96, 96, 96)")).toBeGreaterThan(-1);
    expect(SRC.indexOf("String.fromCharCode(10)")).toBeGreaterThan(-1);
  });
});

describe("画面に出したときに、コード囲みが pre になる", () => {
  const domUtil = (function () {
    const sandbox = { String, Array, Object, JSON, Math, RegExp, console };
    vm.createContext(sandbox);
    vm.runInContext(read(path.join("js", "dom-util.js")), sandbox, { filename: "dom-util" });
    return vm.runInContext("formatRichText", sandbox);
  })();

  const PRE_OPEN = LT + 'pre class="code-block"' + GT;

  test("擬似言語の塊を持つ問題は pre に変わる", () => {
    const withFence = QUIZ.filter(function (q) {
      return q.name.indexOf(BACKTICK + BACKTICK + BACKTICK) >= 0;
    });
    // 擬似言語を1問も持たない科目なら、この見張りは何も主張できない。
    expect(withFence.length).toBeGreaterThan(0);
    const bad = withFence.filter(function (q) {
      return domUtil(q.name).indexOf(PRE_OPEN) < 0;
    }).map(function (q) {
      return q.id;
    });
    expect(bad.join(",")).toBe("");
  });

  test("描いた後にバッククォートが1つも残らない", () => {
    // 囲みの数が奇数だと、閉じられなかった囲みが素の記号として画面に出る。
    const bad = QUIZ.filter(function (q) {
      return domUtil(q.name).indexOf(BACKTICK) >= 0 || domUtil(q.explanation).indexOf(BACKTICK) >= 0;
    }).map(function (q) {
      return q.id;
    });
    expect(bad.join(",")).toBe("");
  });
});
