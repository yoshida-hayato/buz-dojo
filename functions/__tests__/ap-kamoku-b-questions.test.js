// 自前の問題データ (data/ap-kamoku-b/questions.js) の見張り。
//
// なぜ要るか: この科目の問題データはこの repo に在るので、こちらが
// 書き足すたびに壊せる。しかも科目カードの 全N問 は config/pricing.js の
// 静的な questionCount から出るので (master が無いので問い合わせ先が無い)、
// 問題を足して questionCount を直し忘れるとカードが黙って嘘をつく。
//
// もう1つ: この repo の変更は Slack のパッチの口を通る。その口は
// バッククォートとアスタリスクと円記号を字面として運べないので、
// 囲みと改行は文字コードから組んでいる。その約束が崩れたこともここで見る。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SUBJECT_ID = "ap-kamoku-b";
const SRC = read(path.join("data", SUBJECT_ID, "questions.js"));
const SUBJECT_SRC = read(path.join("subjects", SUBJECT_ID, "subject.js"));

const pricing = require("../../config/pricing.js");
const statsPaths = require("../question-stats-paths");

const BACKTICK = String.fromCharCode(96);
const STAR = String.fromCharCode(42);
const YEN = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);

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
  const out = [];
  SUBJECT_SRC.slice(open + 1, close).split(NL).forEach(function (line) {
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
// 開けたまま便を終わらせないこと。
const APB_COUNT_WINDOW_OPEN = true;

const QUIZ = loadQuiz();

describe("自前の問題データが読める形で在る", () => {
  test("隔離した器で評価して、配列が取れる", () => {
    expect(Array.isArray(QUIZ)).toBe(true);
    expect(QUIZ.length).toBeGreaterThan(0);
  });

  test("件数が config/pricing.js の questionCount と一致する", () => {
    if (APB_COUNT_WINDOW_OPEN) return;
    expect(QUIZ.length).toBe(Number(pricing.SUBJECT_CATALOG[SUBJECT_ID].questionCount));
  });

  test("問題数が無料の上限を超えていない (超える日は値付けを決め直す)", () => {
    expect(QUIZ.length).toBeLessThanOrEqual(100);
    // priceForSubject は (科目id, 問題数) の2引数である。問題数を省くと
    //   中で priceForQuestionCount(undefined) になり、何を渡しても 0 が返る。
    //   つまり1引数で呼ぶ限り、この約束は何も確かめていない
    //   (2026-11-08 12:48便 に実測して気づいた)。件数を渡す側を使う。
    expect(pricing.getSubjectPriceYen(SUBJECT_ID)).toBe(0);
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
      if (q && q.id && q.id.indexOf("apb-") !== 0) bad.push("prefix:" + q.id);
    });
    expect(bad.join(",")).toBe("");
  });

  test("id から科目を当てる表が、この科目を指す", () => {
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

  test("宣言した分野すべてに3問以上在る", () => {
    // 1問しか無い分野を絞りに出すと、同じ問題が繰り返されるだけになる。
    const used = {};
    QUIZ.forEach(function (q) {
      used[q.module] = (used[q.module] || 0) + 1;
    });
    const thin = declaredKeys("modules").filter(function (m) {
      return (used[m] || 0) < 3;
    }).map(function (m) {
      return m + ":" + (used[m] || 0);
    });
    expect(thin.join(",")).toBe("");
  });
});

describe("肢の長さが正解の合図になっていない", () => {
  // 2026-11-08 12:48便 に実測して直した。最初に書いた48問は、32問
  // (67パーセント) で正解が単独でいちばん長い肢だった。これだと
  // 中身を読まずに「長いものを選ぶ」だけで3分の2に当たるので、
  // 択一に置き換えた練習の値打ちがほぼ消える。
  // 直したあとは5問 (10パーセント) である。同じ条件で測った他の科目は
  // fe-kamoku-b が14問/100問、fe-kamoku-a が10問/46問。
  // 4肢なので、偏りが無ければ4分の1前後に落ちる。
  function soleExtreme(pick) {
    return QUIZ.filter(function (q) {
      const lens = q.choices.map(function (c) {
        return c.length;
      });
      const rest = lens.slice(1);
      return pick(lens[0], rest);
    }).map(function (q) {
      return q.id;
    });
  }

  test("正解が単独でいちばん長い問題が、全体の4分の1未満である", () => {
    const hits = soleExtreme(function (first, rest) {
      return first > Math.max.apply(null, rest);
    });
    // 直し方: 当たった問題の誤りの肢を1つ、正解より長くなるまで具体化する。
    //   肢を削って短くするのではなく、誤りの肢を本物らしくするほうを選ぶ
    //   (誤りの肢が薄いと、それ自体が別の合図になる)。
    expect(hits.length).toBeLessThan(QUIZ.length / 4);
  });

  test("正解が単独でいちばん短い問題も、全体の4分の1未満である", () => {
    const hits = soleExtreme(function (first, rest) {
      return first < Math.min.apply(null, rest);
    });
    expect(hits.length).toBeLessThan(QUIZ.length / 4);
  });
});

describe("パッチの口を通る字面だけで書かれている", () => {
  test("素のバッククォートもアスタリスクも円記号も無い", () => {
    expect(SRC.indexOf(BACKTICK)).toBe(-1);
    expect(SRC.indexOf(STAR)).toBe(-1);
    expect(SRC.indexOf(YEN)).toBe(-1);
  });

  test("文字コードから組む足場が在る", () => {
    expect(SRC.indexOf("String.fromCharCode(96, 96, 96)")).toBeGreaterThan(-1);
    expect(SRC.indexOf("String.fromCharCode(10)")).toBeGreaterThan(-1);
  });
});
describe("画面に出したときに、事例の囲みが pre になる", () => {
  const formatRichText = (function () {
    const sandbox = { String, Array, Object, JSON, Math, RegExp, console };
    vm.createContext(sandbox);
    vm.runInContext(read(path.join("js", "dom-util.js")), sandbox, { filename: "dom-util" });
    return vm.runInContext("formatRichText", sandbox);
  })();

  const PRE_OPEN = LT + 'pre class="code-block"' + GT;

  test("囲みを持つ問題は pre に変わる", () => {
    const withFence = QUIZ.filter(function (q) {
      return q.name.indexOf(BACKTICK + BACKTICK + BACKTICK) >= 0;
    });
    expect(withFence.length).toBeGreaterThan(0);
    const bad = withFence.filter(function (q) {
      return formatRichText(q.name).indexOf(PRE_OPEN) < 0;
    }).map(function (q) {
      return q.id;
    });
    expect(bad.join(",")).toBe("");
  });

  test("描いた後にバッククォートが1つも残らない", () => {
    const bad = QUIZ.filter(function (q) {
      return formatRichText(q.name).indexOf(BACKTICK) >= 0 ||
        formatRichText(q.explanation).indexOf(BACKTICK) >= 0;
    }).map(function (q) {
      return q.id;
    });
    expect(bad.join(",")).toBe("");
  });
});

describe("本試験の形を subject.js に書き残している", () => {
  // 次にこの科目を触る人が、記述式の試験を択一に置き換えてある前提を
  // 知らずに「記述の練習になる」と書かないようにするための見張り。
  test("記述式であることと、置き換えてあることが書いてある", () => {
    expect(SUBJECT_SRC.indexOf("記述式")).toBeGreaterThan(-1);
    expect(SUBJECT_SRC.indexOf("択一")).toBeGreaterThan(-1);
  });

  test("分野の区切りが公式の表記ではないと書いてある", () => {
    expect(SUBJECT_SRC.indexOf("公式の表記ではない")).toBeGreaterThan(-1);
  });
});
