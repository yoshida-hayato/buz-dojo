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
const APB_COUNT_WINDOW_OPEN = false;

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
    expect(pricing.priceForSubject(SUBJECT_ID)).toBe(0);
  });
});
