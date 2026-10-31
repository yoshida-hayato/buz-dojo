//
// 読み物レッスンの確認クイズ (js/screens-lesson.js) のガード。
// 語の有無ではなく、実際に肢を押して見る。
//
// なぜ要るか: 2026-10-31 に社長が「オントロジー入門が正解押しても次に行かない」
// と報告した。確認クイズが正解を entry の answer で判定していたのが原因である。
// 問題データの約束は「choices の先頭が正解」で、answer を持つのは正誤問題だけ
// である (本番のマスタで aoi-sc-intro-001 の鍵を実測: id / category / module /
// code / priority / name / choices / explanation。answer は無い)。だから
// scenario の問題は全部の肢が不正解と判定され、次へ進む button が一度も
// 作られず、章の読み物を終えられなかった。2026-09-21 から40日この形である。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "screens-lesson.js"), "utf8");
const NL = String.fromCharCode(10);

function fakeEl(tag) {
  const cls = new Set();
  return {
    tagName: tag,
    textContent: "",
    innerHTML: "",
    type: "",
    disabled: false,
    dataset: {},
    children: [],
    classList: {
      add: function () { for (const c of arguments) cls.add(c); },
      remove: function () { for (const c of arguments) cls.delete(c); },
      contains: (c) => cls.has(c),
    },
    get className() { return Array.from(cls).join(" "); },
    set className(v) {
      cls.clear();
      String(v).split(" ").filter(Boolean).forEach((c) => cls.add(c));
    },
    setAttribute: () => {},
    appendChild: function (c) { this.children.push(c); return c; },
    // 押す手を1つだけ覚える。テストはこれを呼んで実際の処理を走らせる
    addEventListener: function (n, fn) { if (n === "click") this.fireClick = fn; },
  };
}

function deep(el, acc) {
  const out = acc || [];
  (el.children || []).forEach((c) => { out.push(c); deep(c, out); });
  return out;
}

const SCENARIO = {
  id: "aoi-sc-intro-001", category: "scenario", module: "オントロジーとは",
  code: "X1", priority: 1, name: "確認の問",
  choices: ["これが正解", "誤りA", "誤りB", "誤りC"], explanation: "解説",
};

function build(opts) {
  const o = opts || {};
  const els = {};
  ["lesson-title", "lesson-progress-label", "lesson-body", "lesson-actions"].forEach((k) => {
    els[k] = fakeEl("div");
  });
  const recorded = [];
  const sections = o.sections || [
    { id: "q1", kind: "quiz", title: "確認1", questionIds: ["aoi-sc-intro-001"] },
  ];
  const sandbox = {
    console: { warn: () => {}, error: () => {} },
    Math, String, Number, Array, Object, JSON, URLSearchParams,
    location: { pathname: "/", search: "", hash: "" },
    history: { replaceState: () => {} },
    document: {
      getElementById: (k) => els[k] || null,
      querySelector: () => null,
      addEventListener: () => {},
      createElement: (tag) => {
        const el = fakeEl(tag);
        el.querySelectorAll = function (sel) {
          const want = String(sel).slice(1);
          return deep(this).filter((c) =>
            sel === "button" ? c.tagName === "button" : c.classList.contains(want));
        };
        return el;
      },
    },
    QUIZ_DATA: o.data || [SCENARIO],
    CURRENT_SUBJECT: { id: "ai-ontology-intro" },
    LessonProgress: {
      hasLesson: () => true,
      chapterLesson: () => ({ title: "オントロジーとは", sections }),
      chapterState: () => ({ sectionIndex: 0 }),
      markSectionDone: () => {},
      lessonComplete: () => false,
    },
    ChapterProgress: {
      hasTextbook: () => true,
      getChapter: () => ({ id: "intro", order: 1, module: "オントロジーとは", clearCorrect: 6 }),
      isCleared: () => false, isUnlocked: () => true, correctCount: () => 0,
      load: () => ({ cleared: {}, correctIdsByChapter: {} }),
      recordCorrect: (s, qid) => { recorded.push(qid); return null; },
    },
    judgmentSingleAnswer: (e) => {
      if (e.answer === "正" || e.answer === "誤") return e.answer;
      return e.choices && e.choices[0] === "誤" ? "誤" : "正";
    },
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    goHome: () => {}, showScreen: () => {}, renderHome: () => {},
    syncHomeTextbookCard: () => {},
  };
  sandbox.window = sandbox;
  sandbox.$ = (k) => sandbox.document.getElementById(k);
  // let の宣言は砂場の属性にならないので、章の id は完了値で受け取った
  // 小さな手から書き込む (学習ログ 2026-10-31 の記録)。
  const api = vm.runInContext(
    SRC + NL + ";({ render: renderLessonScreen, open: function (c) { _lessonChapterId = c; _lessonQuizIndex = 0; } })",
    vm.createContext(sandbox)
  );
  api.open("intro");
  api.render();
  const choices = () => deep(els["lesson-body"]).filter((c) => c.classList.contains("lesson-choice-btn"));
  const feedback = () => deep(els["lesson-body"]).find((c) => c.classList.contains("lesson-quiz-feedback"));
  const actions = () => els["lesson-actions"].children.map((c) => c.textContent);
  return { els, recorded, choices, feedback, actions };
}

describe("読み物レッスンの確認クイズ", () => {
  test("choices の先頭が正解として通り、次へ進む button が1つできる", () => {
    const s = build();
    const btns = s.choices();
    expect(btns.length).toBe(4);
    const hit = btns.find((b) => b.textContent === "これが正解");
    expect(hit).toBeTruthy();
    hit.fireClick();
    expect(s.feedback().textContent).toBe("正解です。");
    expect(s.feedback().classList.contains("is-correct")).toBe(true);
    expect(s.feedback().classList.contains("hidden")).toBe(false);
    expect(s.actions().length).toBe(1);
    expect(s.recorded).toEqual(["aoi-sc-intro-001"]);
    expect(btns.every((b) => b.disabled)).toBe(true);
  });

  test("先頭以外を押すと次へ進む button はできず、肢が押せる状態に戻る", () => {
    const s = build();
    const btns = s.choices();
    btns.find((b) => b.textContent === "誤りB").fireClick();
    expect(s.feedback().textContent).toBe("もう一度選んでください。");
    expect(s.feedback().classList.contains("is-wrong")).toBe(true);
    expect(s.actions().length).toBe(0);
    expect(btns.every((b) => b.disabled === false)).toBe(true);
    expect(s.recorded).toEqual([]);
  });

  test("正誤問題は judgmentSingleAnswer と同じ答え・同じ2肢で通る", () => {
    const data = [{
      id: "aoi-jd-intro-001", category: "judgment", module: "オントロジーとは",
      code: "J1", priority: 1, name: "用語集とオントロジーは同じものである",
      answer: "誤", choices: ["用語集と同じものだ", "用語集とは別のものだ"],
      explanation: "解説J",
    }];
    const sec = [{ id: "q1", kind: "quiz", title: "確認", questionIds: ["aoi-jd-intro-001"] }];
    const a = build({ data, sections: sec });
    expect(a.choices().map((b) => b.textContent).sort()).toEqual(["正", "誤"]);
    a.choices().find((b) => b.textContent === "誤").fireClick();
    expect(a.feedback().textContent).toBe("正解です。");
    const b = build({ data, sections: sec });
    b.choices().find((x) => x.textContent === "正").fireClick();
    expect(b.feedback().textContent).toBe("もう一度選んでください。");
  });

  test("肢の並びは固定でない (正解が先頭に居続けない)", () => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(build().choices()[0].textContent);
    expect(seen.size).toBeGreaterThan(1);
  });

  test("choices が無い問題では、黙って詰まらずに文面が出る", () => {
    const bare = Object.assign({}, SCENARIO);
    delete bare.choices;
    const s = build({ data: [bare] });
    expect(s.choices().length).toBe(0);
    expect(s.els["lesson-body"].textContent).toContain("表示できませんでした");
  });
});
