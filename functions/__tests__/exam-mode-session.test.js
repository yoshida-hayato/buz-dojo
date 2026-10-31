//
// 模試の進行 (js/exam-mode.js) のガード。語の有無ではなく実際に動かして見る。
// (1) 出題設定に絞り込みが1つも入らない (本番は未習得や分野で絞らない)
// (2) 権利が無いときは始まらない。面は見せて鍵だけ掛ける
// (3) 時間切れで残りが未回答として採点に入るが、成績には記録しない。砂場に
//     QuizStorage を置いていないので、記録しようとすれば例外で落ちる
// (4) 合否の文面が、表の基準の問数をそのまま言う
// (5) 模試でないときは合否も時計も出ない
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "exam-mode.js"), "utf8");
const ExamFormats = require(path.join(ROOT, "config", "exam-formats.js"));
const NL = String.fromCharCode(10);

function fakeEl() {
  const classes = new Set();
  return {
    textContent: "",
    dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: function () { for (const c of arguments) classes.delete(c); },
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    has: (c) => classes.has(c),
    addEventListener: function (n, fn) { this.handler = fn; },
  };
}

// 時計を自分で進められる Date。tick の境界を実際に跨いで見るために要る。
function fakeDate(clock) {
  const D = function () {};
  D.now = () => clock.t;
  return D;
}

function build(opts) {
  const o = opts || {};
  const clock = o.clock || { t: 1762000000000 };
  const els = {};
  [
    "exam-card",
    "exam-card-spec",
    "exam-card-note",
    "exam-start-btn",
    "exam-buy-btn",
    "exam-timer",
    "exam-verdict",
  ].forEach((id) => {
    els[id] = fakeEl();
  });
  const calls = { startQuiz: [], render: 0, screen: [], checkout: [], intervals: 0 };
  const sandbox = {
    document: { getElementById: (id) => els[id] || null },
    ExamFormats,
    CURRENT_SUBJECT: o.subject === undefined ? { id: "biz-career" } : o.subject,
    Entitlement: { hasAccess: () => (o.access === undefined ? true : o.access) },
    QUIZ_DATA: o.data || [
      { id: "a", category: "term" },
      { id: "b", category: "term" },
      { id: "c", category: "judgment" },
    ],
    quiz: o.quiz || null,
    subjectUsesDirection: () => !!o.usesDirection,
    startQuiz: (s) => calls.startQuiz.push(s),
    Billing: { startCheckout: (a, b) => calls.checkout.push([a, b]) },
    clearFeedbackCard: () => {},
    renderResult: () => { calls.render += 1; },
    showScreen: (n) => calls.screen.push(n),
    setInterval: () => { calls.intervals += 1; return 1; },
    clearInterval: () => {},
    Date: fakeDate(clock),
    Math, Number, String, Array, Object, console,
  };
  vm.createContext(sandbox);
  // const 宣言は砂場の属性にならないので、完了値で受け取る
  const ExamMode = vm.runInContext(SRC + NL + "ExamMode;", sandbox);
  return { ExamMode, els, calls, sandbox, clock };
}

test("模試の出題設定に絞り込みが1つも入らない", () => {
  const { ExamMode } = build({});
  const s = ExamMode.settingsForExam();
  expect(s.count).toBe(40);
  expect(s.choiceCount).toBe(5);
  expect(s.poolMode).toBe("all");
  expect(s.modules).toBe("all");
  expect(s.priorities).toEqual([1, 2, 3]);
  expect(s.answerMode).toBe("choice");
  expect(s.examMode).toBe(true);
  expect(s.categories.slice().sort()).toEqual(["judgment", "term"]);
  expect(s.direction).toBe("name2code");
});

test("形式を持たない科目では模試の設定を作らず、面も出さない", () => {
  const { ExamMode, els } = build({ subject: { id: "sap" } });
  expect(ExamMode.settingsForExam()).toBe(null);
  ExamMode.paintCard();
  expect(els["exam-card"].has("hidden")).toBe(true);
  ExamMode.start();
});

test("権利が無いと始まらない。面は出して鍵を掛ける", () => {
  const { ExamMode, els, calls } = build({ access: false });
  ExamMode.paintCard();
  expect(els["exam-card"].has("hidden")).toBe(false);
  expect(els["exam-card"].has("is-locked")).toBe(true);
  expect(els["exam-start-btn"].has("hidden")).toBe(true);
  expect(els["exam-buy-btn"].has("hidden")).toBe(false);
  expect(els["exam-card-note"].textContent.length).toBeGreaterThan(0);
  ExamMode.start();
  expect(calls.startQuiz.length).toBe(0);
  els["exam-buy-btn"].handler();
  expect(calls.checkout).toEqual([["subject", "biz-career"]]);
});

test("権利が在れば始まり、面の鍵は外れる", () => {
  const { ExamMode, els, calls } = build({ access: true });
  ExamMode.paintCard();
  expect(els["exam-card"].has("is-locked")).toBe(false);
  expect(els["exam-start-btn"].has("hidden")).toBe(false);
  expect(els["exam-buy-btn"].has("hidden")).toBe(true);
  expect(els["exam-card-note"].textContent).toBe("");
  expect(els["exam-card-spec"].textContent.indexOf("24問")).toBeGreaterThan(-1);
  expect(els["exam-card-spec"].textContent.indexOf("110分")).toBeGreaterThan(-1);
  ExamMode.start();
  expect(calls.startQuiz.length).toBe(1);
  expect(calls.startQuiz[0].examMode).toBe(true);
});

