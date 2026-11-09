// 誤答と解説を引く母集団を、その問題の科目のものにする見張り (ミックス出題 第2段)。
//
// なぜ要るか (2026-11-09 06:48便 に実測)。buildQuestion は、自前の肢を
// 持たない問題 (SAP の tcode / term など) の誤答を「母集団から同じ
// category の別の問題を引く」形で作る。その母集団は大域の QUIZ_DATA で、
// 開いている1科目ぶんしか無い。
//
// 実測した形: QUIZ_DATA を本物の ap-kamoku-b (100問) にしたまま SAP の
// tcode の問題を組むと、ap-kamoku-b に tcode の問題が1件も無いので
// 誤答が0件になり、肢が1つ (正解だけ) の問題が出る。落ちない。
// 利用者は必ず正解し、2回続けば習得が黙って進む。壊れ方として、
// 例外より悪い。
//
// だから第2段は、母集団を決める場所を entryPool の1つに寄せ、
// 出題プールを作る側が「その問題を読み出した科目の配列」を渡す形にした。
// 渡さなければ開いている科目の QUIZ_DATA に落ちるので、本番の動きは
// 1つも変わらない (246問で肢が1文字も違わないことを実測した)。
//
// この見張りが見るのは5件。
//   (1) 母集団を渡せば、別科目の QUIZ_DATA の下でも肢がそろう
//   (2) 渡さなければ肢が1つになる (穴そのものを記録に残す)
//   (3) 誤答の解説も母集団から引く
//   (4) Tコードの索引は母集団が差し替わったら作り直す
//   (5) quiz-builder の中で QUIZ_DATA を読むのは entryPool だけである
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const BUILDER_PATH = path.join(ROOT, "js", "quiz-builder.js");
const BUILDER = fs.readFileSync(BUILDER_PATH, "utf8");
const ENGINE = fs.readFileSync(path.join(ROOT, "js", "quiz-engine.js"), "utf8");

// 本物の ap-kamoku-b の問題データ。偽データを作らずに、repo に在る実物を注入する。
function realApbRows() {
  const src = fs.readFileSync(
    path.join(ROOT, "data", "ap-kamoku-b", "questions.js"),
    "utf8"
  );
  const ctx = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(ctx);
  vm.runInContext(
    "var QUIZ_DATA;" + NL + src + NL + ";globalThis.__ROWS = QUIZ_DATA;",
    ctx
  );
  return ctx.__ROWS;
}

// 本番の SAP道場のマスタの先頭から読んだ実物の形 (2026-11-09 に取得の口で読んだ)。
// 自前の肢を持たないので、誤答は母集団から引かれる枝を通る。
function sapRows() {
  return [
    { id: "t-FB50", category: "tcode", module: "FI", code: "FB50", name: "G/L勘定伝票入力", priority: 1, explanation: "伝票を入力する" },
    { id: "t-FB60", category: "tcode", module: "FI", code: "FB60", name: "仕入先請求書入力", priority: 1, explanation: "仕入先の請求書を入れる" },
    { id: "t-FB70", category: "tcode", module: "FI", code: "FB70", name: "得意先請求書入力", priority: 1, explanation: "得意先の請求書を入れる" },
    { id: "t-VA01", category: "tcode", module: "SD", code: "VA01", name: "受注伝票登録", priority: 1, explanation: "受注を登録する" },
    { id: "t-VA02", category: "tcode", module: "SD", code: "VA02", name: "受注伝票変更", priority: 1, explanation: "受注を変更する" },
    { id: "t-MM01", category: "tcode", module: "MM", code: "MM01", name: "品目マスタ登録", priority: 1, explanation: "品目を登録する" },
    { id: "t-ME21N", category: "tcode", module: "MM", code: "ME21N", name: "購買発注登録", priority: 1, explanation: "発注を登録する" },
  ];
}

// 乱数を決まった数列にする。掛け算を使わずに、固定の並びを順に返す。
function fixedRandom() {
  const seq = [0.11, 0.73, 0.42, 0.95, 0.07, 0.58, 0.31, 0.86, 0.24, 0.67];
  let i = 0;
  return function () {
    const v = seq[i % seq.length];
    i += 1;
    return v;
  };
}

// 本物の quiz-builder を走らせる。QUIZ_DATA は引数で決める。
function loadBuilder(quizData) {
  const mathStub = Object.create(Math);
  mathStub.random = fixedRandom();
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math: mathStub,
    JSON,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    isNaN,
    QUIZ_DATA: quizData,
    CHOICE_COUNT: 6,
    INPUT_CATEGORIES: new Set(),
    MODULE_FILTERABLE: new Set(),
    CATEGORIES: {},
    MODULES: {},
    PRIORITIES: {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "dom-util.js"), "utf8"), ctx);
  const subjectConfig = fs.readFileSync(
    path.join(ROOT, "js", "subject-config.js"),
    "utf8"
  );
  const ckAt = subjectConfig.indexOf("function choiceKey(i) {");
  if (ckAt < 0) throw new Error("choiceKey が見つからない");
  vm.runInContext(subjectConfig.slice(ckAt), ctx);
  const settingsUi = fs.readFileSync(path.join(ROOT, "js", "settings-ui.js"), "utf8");
  const riAt = settingsUi.indexOf(
    "function resolveInputMode(entry, settings, forceInputMode) {"
  );
  if (riAt < 0) throw new Error("resolveInputMode が見つからない");
  const riEnd = settingsUi.indexOf(NL + "}", riAt);
  vm.runInContext(settingsUi.slice(riAt, riEnd + 2), ctx);
  vm.runInContext(BUILDER, ctx);
  return ctx;
}

// quiz-engine の「母集団を問題に持たせる」1行だけを切り出して走らせる。
// 本体は DOM を要るので、効いている式そのものをここで確かめる。
function runPoolAssign(slot) {
  const lines = ENGINE.split(NL);
  let found = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.indexOf("//") === 0) continue;
    if (trimmed.indexOf("built.pool") > -1) {
      if (found !== null) throw new Error("built.pool の行が2つ以上在る");
      found = trimmed;
    }
  }
  if (found === null) throw new Error("built.pool の行が無い");
  const ctx = { Array, built: {}, slot };
  vm.createContext(ctx);
  vm.runInContext(found, ctx);
  return ctx.built.pool;
}

const SETTINGS = {
  direction: "name2code",
  answerMode: "choice",
  categories: [],
  priorities: [1, 2, 3],
  modules: "all",
  poolMode: "all",
};

function sortedChoices(q) {
  return (q.choices || []).slice().sort();
}

test("母集団を渡せば、別科目の QUIZ_DATA の下でも肢がそろう", () => {
  const sap = sapRows();
  const ctx = loadBuilder(realApbRows());
  const q = ctx.buildQuestion(sap[0], SETTINGS, false, sap);
  expect(q.choices.length).toBe(6);
  expect(q.answerIndex).toBeGreaterThan(-1);
  expect(q.choices[q.answerIndex]).toBe("FB50");
  // 肢は全部その科目の実物から来ている
  const codes = sap.map((r) => r.code);
  for (const c of q.choices) {
    expect(codes.indexOf(c)).toBeGreaterThan(-1);
  }
});

test("母集団を渡さないと、別科目の QUIZ_DATA では肢が正解1つだけになる", () => {
  const sap = sapRows();
  const ctx = loadBuilder(realApbRows());
  const q = ctx.buildQuestion(sap[0], SETTINGS, false);
  // これが閉じていない穴そのもの。ミックスの出題プールは必ず母集団を渡すこと
  expect(q.choices.length).toBe(1);
  expect(q.choices[0]).toBe("FB50");
});

test("自分の科目の QUIZ_DATA のときと、母集団を渡したときで肢が同じになる", () => {
  const sap = sapRows();
  const own = loadBuilder(sapRows()).buildQuestion(sap[0], SETTINGS, false);
  const mixed = loadBuilder(realApbRows()).buildQuestion(sap[0], SETTINGS, false, sap);
  expect(sortedChoices(mixed)).toEqual(sortedChoices(own));
  expect(sortedChoices(own).length).toBe(6);
});

test("誤答の解説も、QUIZ_DATA ではなく問題が持つ母集団から引く", () => {
  const sap = sapRows();
  const ctx = loadBuilder(realApbRows());
  // category が tcode だと別の経路 (Tコード索引) に行くので、ここは term で見る
  const entry = { id: "x-1", category: "term", code: "用語A", name: "説明A", priority: 1, explanation: "" };
  const other = { id: "x-2", category: "term", code: "用語B", name: "説明B", priority: 1, explanation: "これが用語Bの意味である。続き" };
  const withPool = { entry, direction: "name2code", pool: [entry, other] };
  const withoutPool = { entry, direction: "name2code" };
  const noted = ctx.quizEntryWrongChoiceNote(withPool, "用語B");
  expect(noted.indexOf("用語B")).toBeGreaterThan(-1);
  expect(noted.indexOf("これが用語Bの意味である。")).toBeGreaterThan(-1);
  // 母集団を持たない問題は、開いている科目 (ap-kamoku-b) を見るので当たらない
  expect(ctx.quizEntryWrongChoiceNote(withoutPool, "用語B")).toBe("");
  expect(sap.length).toBe(7);
});

test("Tコードの索引は、母集団が差し替わったら作り直す", () => {
  const ctx = loadBuilder(realApbRows());
  const poolA = [
    { id: "t-AA01", category: "tcode", code: "AA01", name: "甲の処理", explanation: "甲である。続き" },
    { id: "t-AA02", category: "tcode", code: "AA02", name: "乙の処理", explanation: "乙である。続き" },
  ];
  const poolB = [
    { id: "t-BB01", category: "tcode", code: "BB01", name: "丙の処理", explanation: "丙である。続き" },
    { id: "t-BB02", category: "tcode", code: "BB02", name: "丁の処理", explanation: "丁である。続き" },
  ];
  const qA = { entry: poolA[0], direction: "name2code", pool: poolA };
  const qB = { entry: poolB[0], direction: "name2code", pool: poolB };
  const noteA = ctx.tcodeWrongChoiceNote(qA, "AA02");
  expect(noteA.indexOf("乙である。")).toBeGreaterThan(-1);
  // ここで索引を作り直さないと、poolB の BB02 を引けない (古い実装はこれで落ちる)
  const noteB = ctx.tcodeWrongChoiceNote(qB, "BB02");
  expect(noteB.indexOf("丁である。")).toBeGreaterThan(-1);
  // 戻っても引ける
  const noteA2 = ctx.tcodeWrongChoiceNote(qA, "AA02");
  expect(noteA2.indexOf("乙である。")).toBeGreaterThan(-1);
});

test("quiz-engine は母集団を buildQuestion に渡し、問題にも持たせる", () => {
  const callAt = ENGINE.indexOf("buildQuestion(");
  expect(callAt).toBeGreaterThan(-1);
  const callEnd = ENGINE.indexOf(");", callAt);
  expect(callEnd).toBeGreaterThan(callAt);
  const call = ENGINE.slice(callAt, callEnd);
  // 第4引数が母集団であること。字面ではなく、呼び出しの中に在ることを見る
  expect(call.indexOf("slot.pool")).toBeGreaterThan(-1);
  expect(call.indexOf("slot.forceInputMode")).toBeGreaterThan(-1);
  expect(call.indexOf("slot.forceInputMode")).toBeLessThan(call.indexOf("slot.pool"));
  // 組んだ問題にも持たせること (解説の経路が q.pool を見る)。
  // 字面が在ることではなく、その1行を実際に走らせて効いているかを見る
  // (失敗の型7。1度目の壊し方の確かめで、ここを if (false) にしても
  // 字面の検査は素通りした)。
  const assignAt = ENGINE.indexOf("built.pool = slot.pool");
  expect(assignAt).toBeGreaterThan(-1);
  expect(assignAt).toBeGreaterThan(callAt);
  const rows = sapRows();
  expect(runPoolAssign({ pool: rows })).toBe(rows);
  expect(runPoolAssign({})).toBe(undefined);
});

test("ショートカットのトークンも、渡した母集団から集める", () => {
  // parts を持たないショートカットの問題は buildShortcutPartDefs を通る。
  // 母集団が別科目だと、その科目のキーが1つも混ざらない。
  const ctx = loadBuilder(realApbRows());
  const pool = [
    { id: "ws-x-001", category: "shortcut", module: "Excel", code: "Ctrl+Shift+ZZZ", name: "甲", priority: 1 },
    { id: "ws-x-002", category: "shortcut", module: "Excel", code: "Ctrl+YYY", name: "乙", priority: 1 },
    { id: "ws-x-003", category: "shortcut", module: "Excel", code: "Alt+XXX", name: "丙", priority: 1 },
  ];
  const q = ctx.buildQuestion(pool[0], SETTINGS, false, pool);
  expect(q.isShortcutParts).toBe(true);
  const all = [];
  for (const part of q.parts) {
    for (const c of part.choices) all.push(c);
  }
  // 母集団にしか無いトークンが誤答候補に入っていること
  const fromPool = ["YYY", "XXX"].filter((t) => all.indexOf(t) > -1);
  expect(fromPool.length).toBeGreaterThan(0);
  // 母集団を渡さないと、ap-kamoku-b には shortcut が1件も無いので入らない
  const bare = ctx.buildQuestion(pool[0], SETTINGS, false);
  const bareAll = [];
  for (const part of bare.parts) {
    for (const c of part.choices) bareAll.push(c);
  }
  expect(["YYY", "XXX"].filter((t) => bareAll.indexOf(t) > -1).length).toBe(0);
});

test("quiz-builder の中で QUIZ_DATA を読むのは entryPool だけである", () => {
  const lines = BUILDER.split(NL);
  const fnHead = "function entryPool(src) {";
  let inFn = false;
  const leftovers = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.indexOf(fnHead) === 0) {
      inFn = true;
      continue;
    }
    if (inFn) {
      if (trimmed === "}") inFn = false;
      continue;
    }
    if (trimmed.indexOf("//") === 0) continue;
    if (trimmed.indexOf("QUIZ_DATA") > -1) leftovers.push(trimmed);
  }
  expect(inFn).toBe(false);
  expect(leftovers).toEqual([]);
});
