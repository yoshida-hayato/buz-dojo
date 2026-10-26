// 「まだ一度も解いていない問題のみ」で出題できることのガード。
//
// なぜ要るか (2026-10-26):
//   社長の 11:08 の依頼に「過去問道場のアプリを参考にすると良い」が在った。
//   実物を見て比べたら、向こうに在ってこちらに無い絞り込みが1つだけだった:
//   「未回答問題だけを出題する」。こちらの出題対象は 未習得 / 間違えたことが
//   ある / すべて の3つで、未習得は「2回連続正解に届いていない問題」なので、
//   一度も見ていない問題と、何度も解いたが詰まっている問題が混ざる。
//   4,951問の SAP では、新しい地面だけを踏む道が無かった。
//
// 壊し方の想定: 除外が効かない / 一度でも解いた問題が混じる / 正解した問題だけ
//   除外する (間違えた問題が残る) / 記述式の挑戦を数えない / 他のモードに波及する
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const UI = fs.readFileSync(path.join(ROOT, "js", "settings-ui.js"), "utf8");
const INDEX = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const STORAGE = fs.readFileSync(path.join(ROOT, "js", "storage.js"), "utf8");

const FN = "function buildPool(settings) {";

// q1 未挑戦 / q2 選択式で挑戦して不正解 / q3 2回連続正解 (習得) /
// q4 記述式だけ挑戦 / q5 未挑戦
const STATS = {
  q2: { a: 1, c: 0 },
  q3: { a: 2, c: 2, ck: 2 },
  q4: { a: 0, c: 0, ia: 1 },
};
const DATA = ["q1", "q2", "q3", "q4", "q5"].map((id) => ({
  id,
  category: "term",
  priority: "high",
  module: "m1",
}));

function makeStorage() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(STORAGE + "\n;globalThis.__S = QuizStorage;", ctx);
  const S = ctx.__S;
  S.stats = { q: JSON.parse(JSON.stringify(STATS)) };
  return S;
}

function poolIds(poolMode) {
  const storage = makeStorage();
  const ctx = {
    console,
    QuizStorage: storage,
    QUIZ_DATA: DATA,
    MODULE_FILTERABLE: new Set(["term"]),
    INPUT_CATEGORIES: new Set(),
    document: { querySelectorAll: () => [] },
  };
  vm.createContext(ctx);
  const i = UI.indexOf(FN);
  if (i < 0) throw new Error("buildPool が見つからない");
  const body = UI.slice(i, UI.indexOf("\n}\n", i) + 3);
  vm.runInContext(body + "\n;globalThis.__B = buildPool;", ctx);
  return ctx
    .__B({
      poolMode,
      categories: ["term"],
      priorities: ["high"],
      modules: "all",
      answerMode: "choice",
    })
    .map((s) => s.entry.id);
}

describe("解いた問題の数え方", () => {
  test("選択式でも記述式でも、挑戦が1回あれば 解いた になる", () => {
    const S = makeStorage();
    expect(S.answeredIds().sort()).toEqual(["q2", "q3", "q4"]);
  });

  test("正解したかどうかは見ない (不正解も 解いた)", () => {
    const S = makeStorage();
    expect(S.answeredIds().indexOf("q2") >= 0).toBe(true);
  });

  test("成績がまったく無いときは空", () => {
    const S = makeStorage();
    S.stats = { q: {} };
    expect(S.answeredIds()).toEqual([]);
  });
});

describe("出題対象: まだ一度も解いていない問題のみ", () => {
  test("未挑戦の2問だけが出る", () => {
    expect(poolIds("untouched").sort()).toEqual(["q1", "q5"]);
  });

  test("未習得とは違う (対照)", () => {
    // 未習得は q3 (習得済み) だけを外すので、解いた q2 と q4 が残る。
    // ここが同じ答えになったら、新しいモードは何も足していない。
    const unmastered = poolIds("unmastered").sort();
    expect(unmastered).toEqual(["q1", "q2", "q4", "q5"]);
    expect(unmastered).not.toEqual(poolIds("untouched").sort());
  });

  test("他のモードは変わらない (回帰)", () => {
    expect(poolIds("all").sort()).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(poolIds("wrong").sort()).toEqual(["q2"]);
  });

  test("全部解き終えたら空になる (壁ではなく空)", () => {
    const S = makeStorage();
    expect(S).toBeTruthy();
    const ctx = {
      console,
      QuizStorage: {
        choiceMasteredIds: () => [],
        inputMasteredIds: () => [],
        wrongIds: () => [],
        answeredIds: () => ["q1", "q2", "q3", "q4", "q5"],
      },
      QUIZ_DATA: DATA,
      MODULE_FILTERABLE: new Set(["term"]),
      INPUT_CATEGORIES: new Set(),
      document: { querySelectorAll: () => [] },
    };
    vm.createContext(ctx);
    const i = UI.indexOf(FN);
    const body = UI.slice(i, UI.indexOf("\n}\n", i) + 3);
    vm.runInContext(body + "\n;globalThis.__B = buildPool;", ctx);
    const pool = ctx.__B({
      poolMode: "untouched",
      categories: ["term"],
      priorities: ["high"],
      modules: "all",
      answerMode: "choice",
    });
    expect(pool).toEqual([]);
  });
});

describe("画面に出ていて、空のときの案内が在る", () => {
  test("出題対象の選択肢に入っている", () => {
    expect(INDEX.indexOf('value="untouched"') >= 0).toBe(true);
    expect(INDEX.indexOf("まだ一度も解いていない問題のみ") >= 0).toBe(true);
  });

  test("既定は未習得のまま (初見の挙動を変えない)", () => {
    const i = INDEX.indexOf('id="pool-mode-select"');
    const block = INDEX.slice(i, INDEX.indexOf("</select>", i));
    const selected = block
      .split("<option")
      .filter((o) => o.indexOf("selected") >= 0)
      .map((o) => o.split('value="')[1].split('"')[0]);
    expect(selected).toEqual(["unmastered"]);
  });

  test("空のときの文言と、立て直しの案内が在る", () => {
    expect(UI.indexOf("この条件の問題はすべて一度は解いています") >= 0).toBe(true);
    expect(
      UI.indexOf("この条件の問題は、すべて一度は解いています。") >= 0
    ).toBe(true);
  });
});
