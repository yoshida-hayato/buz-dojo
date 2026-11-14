//
// ミックス出題 第3段: buildMixedPoolFrom が科目ごとに上書きしている欄が、
// 現に効いていることだけを見る1枚。
//
// なぜ別の1枚かというと、2026-11-15 に壊し方を9通り試したら、3通りが
// 素通りしたからである。素通りした3つは、既存の見張りの入力の作りでは
// その欄が1度も使われない形だった (記述式の絞り、モジュールの絞り、
// 値の重複)。失敗の型20 の「検査が緩い」ではなく「入力の種類が足りない」で、
// 失敗の型15 と同じ形である。ここは、その3つを使う入力を自分で作る。
//
const H = require("../test-helpers/mix-pool-sandbox.js");

const E = H.entriesOf("fe-kamoku-b");
const CAT = "scenario";

describe("門1: 解答方式を選択式に固定する", () => {
  test("記述式を頼んでも、未習得の判定は選択式の成績で行う", () => {
    const b = H.load(E);
    const choiceDone = new Set(E.slice(0, 30).map((q) => q.id));
    const inputDone = new Set(E.slice(0, 70).map((q) => q.id));
    const src = H.source("fe-kamoku-b", E, {
      inputCategories: new Set([CAT]),
      choiceMastered: choiceDone,
      inputMastered: inputDone,
    });
    const st = Object.assign({}, H.BASE_SETTINGS, {
      answerMode: "input", poolMode: "unmastered",
    });
    // 固定が効いていれば 100 から 30 を引いた 70。
    // settings の input が通ると 100 から 70 を引いた 30 になる
    expect(b.buildMixedPoolFrom(st, [src]).length).toBe(70);
  });

  test("両方を頼んでも、1問が2枠に増えない", () => {
    const b = H.load(E);
    const src = H.source("fe-kamoku-b", E, { inputCategories: new Set([CAT]) });
    const st = Object.assign({}, H.BASE_SETTINGS, { answerMode: "both" });
    expect(b.buildMixedPoolFrom(st, [src]).length).toBe(100);
  });
});

describe("門2: モジュールの絞りを切る", () => {
  test("モジュールの絞りが立っていても、1問も落とさない", () => {
    const b = H.load(E);
    const src = H.source("fe-kamoku-b", E, {
      moduleFilterable: new Set([CAT]),
      hasModuleInputs: true,
    });
    const st = Object.assign({}, H.BASE_SETTINGS, { modules: ["no-such-module"] });
    // 切れていれば 100。切れていないと、どの問題も module を持たないので 0
    expect(b.buildMixedPoolFrom(st, [src]).length).toBe(100);
    // 対照: 同じ入力を buildPoolFrom に素で渡すと現に 0 になる
    expect(b.buildPoolFrom(st, src).length).toBe(0);
  });
});

describe("門3: 科目ごとに通す値は、重複を外してある", () => {
  test("同じ値が何度出ても、一覧には1つだけ入る", () => {
    // 重複を外さないと、sap の 4,951問では分野の一覧が 4,951件になり、
    // includes が問題ごとに走る。結果は同じだが掛け算の桁が変わる
    const b = H.load(E);
    const distinct = require("vm").runInContext("distinctFieldValues", b.ctx);
    const rows = [
      { category: "a", priority: 1 },
      { category: "a", priority: 2 },
      { category: "b", priority: 1 },
      null,
      { category: undefined, priority: null },
      { category: "a", priority: 3 },
    ];
    expect(distinct(rows, "category")).toEqual(["a", "b"]);
    expect(distinct(rows, "priority")).toEqual([1, 2, 3]);
    expect(distinct([], "category")).toEqual([]);
  });

  test("実データでも、一覧が問題数より短い", () => {
    const b = H.load(E);
    const distinct = require("vm").runInContext("distinctFieldValues", b.ctx);
    expect(distinct(E, "category").length).toBe(1);
    expect(distinct(E, "priority").length).toBe(3);
    expect(E.length).toBe(100);
  });
});
