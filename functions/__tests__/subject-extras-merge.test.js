// 問題マスタの judgment / order / contrast が、出題プールに必ず入ることのガード。
//
// 2026-10-11 実測。マスタ (別アプリ) の questions.js は末尾でこの3つを
// QUIZ_DATA に push する約束だが、その3行が無い科目がある。
//   outlook-mail       本体72 + 正誤28 = カタログ100。push 無し
//   ai-ontology-intro  本体48 + 正誤12 = カタログ 60。push 無し
//   teams-collab / excel-functions      push 有り
// 出題プールは settings-ui.js の buildPool が QUIZ_DATA だけを filter して作り、
// JUDGMENT_DATA を読む画面は無い。だから push が無い科目では subject.js が
// categories に宣言している 正誤問題 が1問も出ず、取得だけして捨てていた。
// マスタは別担当で直せないので読む側 (js/subject-loader.js) で埋めた。
// 詳細は docs/AGENT_LEARNING_LOG.md の 2026-10-11 18:48便。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LOADER_SRC = path.join(__dirname, "..", "..", "js", "subject-loader.js");
const SETTINGS_SRC = path.join(__dirname, "..", "..", "js", "settings-ui.js");

const loaderSrc = fs.readFileSync(LOADER_SRC, "utf8");

// 実際に配信される取りこぼし埋めの本体だけを切り出す
function mergeBlock() {
  const from = loaderSrc.indexOf("const seenIds = new Set();");
  const to = loaderSrc.indexOf("window.QUIZ_DATA = quiz;");
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  return loaderSrc.slice(from, to);
}

// 切り出した本体を本物のまま走らせる
function runMerge(quiz, judgment, order, contrast) {
  const ctx = { quiz, judgment, order, contrast };
  vm.createContext(ctx);
  vm.runInContext(mergeBlock(), ctx);
  return ctx.quiz;
}

const q = (id) => ({ id, category: "scenario" });
const j = (id) => ({ id, category: "judgment" });

describe("questions.js に push が無い科目でも、正誤問題が出題プールに入る", () => {
  test("outlook-mail の形 (本体72 + 正誤28) でカタログの100問に揃う", () => {
    const quiz = Array.from({ length: 72 }, (_, i) => q("om-" + i));
    const judgment = Array.from({ length: 28 }, (_, i) => j("om-j-" + i));
    expect(runMerge(quiz, judgment, [], []).length).toBe(100);
  });

  test("ai-ontology-intro の形 (本体48 + 正誤12) でカタログの60問に揃う", () => {
    const quiz = Array.from({ length: 48 }, (_, i) => q("aoi-" + i));
    const judgment = Array.from({ length: 12 }, (_, i) => j("aoi-j-" + i));
    expect(runMerge(quiz, judgment, [], []).length).toBe(60);
  });

  test("category judgment の問題が、埋めたあとのプールに現に居る", () => {
    const merged = runMerge([q("a")], [j("b")], [], []);
    expect(merged.map((x) => x.id)).toEqual(["a", "b"]);
    expect(merged.some((x) => x.category === "judgment")).toBe(true);
  });

  test("order と contrast も同じ扱いで入る", () => {
    const merged = runMerge([q("a")], [j("b")], [{ id: "c" }], [{ id: "d" }]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("既に push している科目では1問も増えない", () => {
  test("同じ id が両方に居るときは二重に入らない", () => {
    const quiz = [q("a"), j("b"), { id: "c" }];
    const merged = runMerge(quiz, [j("b")], [{ id: "c" }], []);
    expect(merged.length).toBe(3);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  test("teams-collab の形 (本体が既に全件) で件数が動かない", () => {
    const all = Array.from({ length: 95 }, (_, i) => q("tc-" + i));
    const judgment = all.slice(70);
    expect(runMerge(all, judgment, [], []).length).toBe(95);
  });
});

describe("壊れた入力で落ちない", () => {
  test("空の追加データなら本体のままにする", () => {
    expect(runMerge([q("a")], [], [], []).map((x) => x.id)).toEqual(["a"]);
  });

  test("id の無い要素と null は入れない", () => {
    const merged = runMerge([q("a")], [null, {}, { id: "" }, j("b")], [], []);
    expect(merged.map((x) => x.id)).toEqual(["a", "b"]);
  });

  test("本体に id の無い要素が居ても追加側を落とさない", () => {
    const merged = runMerge([{}, q("a")], [j("b")], [], []);
    expect(merged.length).toBe(3);
  });
});

describe("この埋めが要る理由 (出題プールの出どころ)", () => {
  test("buildPool は QUIZ_DATA だけを見ている", () => {
    const src = fs.readFileSync(SETTINGS_SRC, "utf8");
    const from = src.indexOf("function buildPool(");
    const to = src.indexOf("function updatePoolCount(");
    expect(from).toBeGreaterThan(0);
    const body = src.slice(from, to);
    expect(body).toContain("QUIZ_DATA.filter(");
    expect(body).not.toContain("JUDGMENT_DATA");
    expect(body).not.toContain("ORDER_DATA");
    expect(body).not.toContain("CONTRAST_DATA");
  });

  test("取りこぼし埋めが subject-loader.js に現に在る", () => {
    expect(mergeBlock()).toContain("seenIds");
    expect(loaderSrc).toContain("for (const extra of [judgment, order, contrast])");
  });
});
