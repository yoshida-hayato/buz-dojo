//
// 無いファイルが 200 で頁を返す経路の見張り、その2 (js/subject-loader.js)。
// 見分けそのものは subject-data-html-fallback.test.js が見ている。
// こちらは、頁が返ったときに取得の2つの口がどう振る舞うかを見る。
//   任意のファイル (judgment / order / contrast / changelog / lesson) は
//   既定に落ちて科目が開き、必須のファイル (questions.js) は評価せずに落ちる。
//
const H = require("../test-helpers/subject-loader-sandbox");
const { load, makeFetch, PAGE, REAL_QUESTIONS, NL } = H;

describe("約束2: 任意のファイルに頁が返ったら、既定に落ちて科目は開く", () => {
  test("judgment と order と contrast に頁が返っても、本体の問題で開く", async () => {
    const f = makeFetch({ "questions.js": REAL_QUESTIONS }, PAGE);
    const { api, win } = load(f);
    await api.loadSubject("fe-kamoku-b");
    expect(win.QUIZ_DATA.length).toBe(2);
    expect(win.JUDGMENT_DATA).toEqual([]);
    expect(win.ORDER_DATA).toEqual([]);
    expect(win.CONTRAST_DATA).toEqual([]);
  });

  test("changelog と lesson に頁が返っても、科目は開く", async () => {
    const f = makeFetch({ "questions.js": REAL_QUESTIONS }, PAGE);
    const { api, win } = load(f);
    await api.loadSubject("fe-kamoku-b");
    expect(win.CHANGELOG).toBe(undefined);
    expect(win.LESSON_DATA).toBe(undefined);
    expect(api.getLoadedId()).toBe("fe-kamoku-b");
  });

  test("取りに行った道に、頁が返る3つが本当に含まれている", async () => {
    const f = makeFetch({ "questions.js": REAL_QUESTIONS }, PAGE);
    const { api } = load(f);
    await api.loadSubject("fe-kamoku-b");
    const tails = f.calls.map((u) => u.split("/").pop());
    expect(tails.indexOf("judgment-questions.js") !== -1).toBe(true);
    expect(tails.indexOf("order-questions.js") !== -1).toBe(true);
    expect(tails.indexOf("contrast-questions.js") !== -1).toBe(true);
  });
});

describe("約束3: 必須のファイルに頁が返ったら、評価せずに落ちる", () => {
  test("questions.js に頁が返ったら科目は開かない", async () => {
    const f = makeFetch({}, PAGE);
    const { api, win } = load(f);
    let caught = null;
    try {
      await api.loadSubject("fe-kamoku-b");
    } catch (e) {
      caught = e;
    }
    expect(caught === null).toBe(false);
    // 山かっこの SyntaxError ではなく、こちらが出した理由で落ちていること。
    // ここが SyntaxError になるなら、頁が new Function に渡っている。
    // 理由の字面まで見るのは、門が throw をやめて空文字を返す形に書き替わると
    // 「問題データが空です」で落ちて、頁が原因であることが消えるためである
    // (この壊し方は 2026-11-14 に実測し、字面を見るまで素通りした)
    expect(String(caught.message).indexOf("Unexpected token")).toBe(-1);
    expect(String(caught.message).indexOf("頁が返りました") !== -1).toBe(true);
    expect(String(caught.message).indexOf("questions.js") !== -1).toBe(true);
    expect(win.QUIZ_DATA).toBe(undefined);
  });

  test("隔離して読む台本に頁が返ったら、評価せずに落ちる", async () => {
    const f = makeFetch({}, PAGE);
    const { api } = load(f);
    let caught = null;
    try {
      await api.loadDataScript("/data/fe-kamoku-b/changelog.js", "test", ["CHANGELOG"]);
    } catch (e) {
      caught = e;
    }
    expect(caught === null).toBe(false);
    expect(String(caught.message).indexOf("Unexpected token")).toBe(-1);
    expect(String(caught.message).indexOf("頁が返りました") !== -1).toBe(true);
  });

  test("同じ道で素の JS が返るなら、評価して大域に載る", async () => {
    const body = 'var CHANGELOG = [{ date: "2026-11-14", added: 1 }];' + NL;
    const f = makeFetch({ "changelog.js": body }, PAGE);
    const { api, win } = load(f);
    const out = await api.loadDataScript("/data/fe-kamoku-b/changelog.js", "test", ["CHANGELOG"]);
    expect(out.CHANGELOG.length).toBe(1);
    expect(win.CHANGELOG.length).toBe(1);
  });
});
