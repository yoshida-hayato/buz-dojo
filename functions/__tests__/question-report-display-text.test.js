//
// 問題指摘に載る「問題文」のガード。
//
// なぜ要るか: 利用者が「この問題はおかしい」と送ってくるとき、管理画面で
// 読む側に要るのは「利用者が実際に見た字面」である。ところが
// screens-contact.js は entry.name をそのまま載せていた。コード→機能 の
// 向き (SAP の Tコード、ショートカット) と略称では、name は答えそのもので
// あり、利用者が見た識別子はどこにも載らない。2026-11-08 に本物の
// quiz-builder を vm で読んで実測し、7つの形のうち3つで答えが載ることを
// 確かめた。
//
// いちばん効く不変条件: 載る問題文は、登録正解の中に現れてはならない。
// これは形ごとの字面に依存せず、答えが漏れたときだけ落ちる。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);

function read(dir, name) {
  return fs.readFileSync(path.join(ROOT, dir, name), "utf8");
}

function load(withBuilder) {
  const box = {
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    console: { warn() {}, error() {} },
    String, Number, Array, Object, Math, JSON, Boolean, Set, Map, Date, RegExp,
    isNaN, parseInt, parseFloat,
  };
  box.window = box;
  const parts = [
    read("js", "app-state.js"),
    read("js", "dom-util.js"),
    read("js", "subject-config.js"),
    read("js", "settings-ui.js"),
  ];
  if (withBuilder) parts.push(read("js", "quiz-builder.js"));
  parts.push(read("js", "screens-contact.js"));
  const tail =
    ";({ build: typeof buildQuestion === 'function' ? buildQuestion : null," +
    " prompt: typeof questionText === 'function' ? questionText : null," +
    " review: typeof wrongItemQuestionLabel === 'function' ? wrongItemQuestionLabel : null," +
    " shown: getQuestionDisplayText, answer: getRegisteredAnswerText," +
    " setData: function (d) { QUIZ_DATA = d; INPUT_CATEGORIES = new Set(['tcode']); } })";
  return vm.runInNewContext(parts.join(NL + ";" + NL) + NL + tail, box);
}

const ENTRIES = {
  tcode: { id: "t1", category: "tcode", code: "VA01", name: "受注伝票を登録する", module: "SD" },
  shortcut: { id: "s1", category: "shortcut", code: "Ctrl + Shift + N", name: "新しいフォルダーを作成する", module: "エクスプローラー" },
  term: { id: "m1", category: "term", code: "WBS要素", name: "プロジェクトを階層に分けて管理する単位", module: "PS" },
  abbr: {
    id: "a1", category: "abbr", code: "MRP", name: "Material Requirements Planning",
    abbrScope: "SAP", module: "PP",
    parts: [
      { answer: "Material", wrongs: ["Machine", "Master", "Module", "Manual"] },
      { answer: "Requirements", wrongs: ["Resource", "Request", "Report", "Return"] },
      { answer: "Planning", wrongs: ["Posting", "Pricing", "Picking", "Plant"] },
    ],
  },
  judgment: { id: "j1", category: "judgment", code: "在庫評価", name: "移動平均法では受入ごとに単価が変わる", answer: "正", choices: ["正", "誤"], module: "MM" },
  scenario: { id: "sc1", category: "scenario", code: "B1-1", name: "次の手続を実行し終えたとき、x の値はどれか。", choices: ["8", "3", "0", "-1"], module: "擬似言語の基本" },
  contrast: { id: "c1", category: "contrast", code: "CO-PA", name: "収益性分析と原価センタ会計の違いはどれか", choices: ["収益側を分析する", "原価側だけを見る"], module: "CO" },
};

const api = load(true);
api.setData(Object.values(ENTRIES));

function q(key, settings) {
  return api.build(ENTRIES[key], settings || { direction: "code2name", choiceCount: 4 });
}

const ALL = [];
Object.keys(ENTRIES).forEach((key) => {
  ["code2name", "name2code"].forEach((direction) => {
    ALL.push({ key, direction, q: q(key, { direction, choiceCount: 4 }) });
  });
});
ALL.push({
  key: "tcode", direction: "input",
  q: q("tcode", { direction: "name2code", answerMode: "input", choiceCount: 4 }),
});

describe("問題指摘に載る問題文", () => {
  test("測る土台: 15通りとも組み立てられている", () => {
    expect(ALL.length).toBe(15);
    ALL.forEach((c) => expect(c.q).toBeTruthy());
    expect(q("tcode", { direction: "code2name", choiceCount: 4 }).direction).toBe("code2name");
    expect(q("abbr").direction).toBe("abbr");
    expect(ALL[ALL.length - 1].q.inputMode).toBe(true);
  });

  // 本題。形ごとの字面に依存しない
  test("どの形でも、載る問題文が登録正解の中に現れない", () => {
    ALL.forEach((c) => {
      const shown = String(api.shown(c.q));
      const answer = String(api.answer(c.q));
      expect(shown.length).toBeGreaterThan(0);
      expect(answer.indexOf(shown)).toBeLessThan(0);
    });
  });

  test("コード→機能 と略称では、利用者が見た識別子が載る", () => {
    const cases = [
      { key: "tcode", direction: "code2name" },
      { key: "shortcut", direction: "code2name" },
      { key: "abbr", direction: "code2name" },
    ];
    cases.forEach((cc) => {
      const built = q(cc.key, { direction: cc.direction, choiceCount: 4 });
      const shown = String(api.shown(built));
      const code = ENTRIES[cc.key].code;
      expect(shown.indexOf(code)).toBeGreaterThanOrEqual(0);
      expect(shown).not.toBe(ENTRIES[cc.key].name);
      // 画面の問題文にも同じ識別子が出ている
      expect(String(api.prompt(built)).indexOf(code)).toBeGreaterThanOrEqual(0);
    });
  });

  test("復習リストの字面と1文字も違わない (出どころを1つに保つ)", () => {
    ALL.forEach((c) => {
      expect(String(api.shown(c.q))).toBe(String(api.review(c.q)));
    });
  });

  // 正常な形は動かさない。科目A と科目B はここに入る
  test("選択肢を持つ形 (科目A・科目B・対比) は entry の name がそのまま載る", () => {
    ["scenario", "contrast"].forEach((key) => {
      expect(String(api.shown(q(key)))).toBe(ENTRIES[key].name);
    });
    expect(String(api.shown(q("term")))).toBe(ENTRIES.term.name);
    expect(String(api.shown(q("judgment")))).toBe("正誤: " + ENTRIES.judgment.name);
  });

  // name を持たない形 (復習リストの字面が空になる) では、code に落ちる。
  // ここが緩むと 問題文: undefined という字面が管理画面に並ぶ
  test("name が無い問題では、空の字面ではなく code が載る", () => {
    const nameless = { id: "n1", category: "scenario", code: "B9-9", choices: ["あ", "い", "う", "え"] };
    const built = api.build(nameless, { direction: "code2name", choiceCount: 4 });
    expect(built).toBeTruthy();
    expect(api.review(built)).toBeUndefined();
    expect(String(api.shown(built))).toBe("B9-9");
  });

  // quiz-builder は後から読む。読めていない場合に投げると、送信が死ぬ
  test("quiz-builder が読めていなくても投げず、name に落ちる", () => {
    const bare = load(false);
    expect(bare.review).toBe(null);
    const out = bare.shown({ entry: ENTRIES.tcode });
    expect(out).toBe(ENTRIES.tcode.name);
    expect(String(bare.shown({ entry: { id: "x1", code: "ZZ01" } }))).toBe("ZZ01");
    expect(String(bare.shown({ entry: { id: "x2" } }))).toBe("x2");
  });
});
