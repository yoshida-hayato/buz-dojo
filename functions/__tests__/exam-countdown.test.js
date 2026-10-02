/**
 * js/screens-subjects.js の試験カウントダウンの単体テスト。
 *
 * なぜ functions/__tests__ に置くか:
 *   パッチの検証ゲート (scripts/bridge/apply_patch.py の run_tests) が jest を走らせるのは
 *   functions/ の中だけで、js/ 配下にテストの置き場所が無い。.github/ は変更できないため、
 *   ブラウザ側の純粋関数のテストもここに置く。js/ の最初のテストがこれ。
 *
 * 読み込み方:
 *   js/screens-subjects.js は <script> で読まれる素のスクリプトで module.exports が無い。
 *   vm で素のコンテキストに評価すると、トップレベルの関数宣言がコンテキストの
 *   プロパティとして取り出せる。DOM に触る関数は呼ばないので document のスタブは不要。
 *   日付は、コンテキストに固定時刻の Date を渡して固定する (Date.now() と new Date() の両方)。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = path.join(__dirname, "..", "..", "js", "screens-subjects.js");

/** 指定の時刻に固定したコンテキストで screens-subjects.js を評価する */
function loadAt(nowIso) {
  const src = fs.readFileSync(SOURCE, "utf8");
  const fixed = new Date(nowIso).getTime();
  class FixedDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  }
  const ctx = vm.createContext({
    Date: FixedDate,
    Math,
    JSON,
    Intl,
    console,
    window: {},
  });
  vm.runInContext(src, ctx, { filename: "screens-subjects.js" });
  return ctx;
}

describe("bizCareerExamDaysLeft (JST の残り日数)", () => {
  // [固定時刻, 残り日数] — 前期 2026-10-04 / 後期 2027-02-14
  const cases = [
    ["2026-10-03T07:00:00+09:00", 1],
    ["2026-10-03T23:59:00+09:00", 1], // JST の日付境界の手前
    ["2026-10-04T00:30:00+09:00", 0], // 試験当日
    ["2026-10-04T23:00:00+09:00", 0], // 当日は一日中 0
    ["2026-10-05T00:30:00+09:00", 132], // 前期を過ぎたら後期までの日数
    ["2026-12-15T12:00:00+09:00", 61],
    ["2026-12-16T12:00:00+09:00", 60], // 文言が出はじめる境界
    ["2027-01-31T12:00:00+09:00", 14], // 最上段へ上がる境界 (EXAM_LIFT_DAYS)
    ["2027-02-14T09:00:00+09:00", 0],
  ];

  test("9つの固定時刻で残り日数が合う", () => {
    for (const [nowIso, expected] of cases) {
      expect([nowIso, loadAt(nowIso).bizCareerExamDaysLeft("biz-career")]).toEqual([
        nowIso,
        expected,
      ]);
    }
  });

  test("最後の試験日を過ぎたら null (定数を足し忘れたら気づける)", () => {
    expect(loadAt("2027-02-15T09:00:00+09:00").bizCareerExamDaysLeft("biz-career")).toBe(null);
  });

  test("生産管理系の3科目だけが対象", () => {
    const ctx = loadAt("2026-10-03T07:00:00+09:00");
    for (const id of ["biz-career", "biz-pm-planning", "biz-pm-operation"]) {
      expect(ctx.bizCareerExamDaysLeft(id)).toBe(1);
    }
    for (const id of ["sap", "excel", "outlook", "teams"]) {
      expect(ctx.bizCareerExamDaysLeft(id)).toBe(null);
    }
  });
});

describe("subjectExamCountdownHtml (カードの注記)", () => {
  test("試験前日は あと1日", () => {
    expect(loadAt("2026-10-03T07:00:00+09:00").subjectExamCountdownHtml("biz-career")).toContain(
      "ビジキャリ試験まであと1日"
    );
  });

  test("試験当日は 本日", () => {
    expect(loadAt("2026-10-04T10:00:00+09:00").subjectExamCountdownHtml("biz-career")).toContain(
      "本日がビジキャリ試験日です"
    );
  });

  test("60日より前は何も出さない (出す側の境界)", () => {
    const ctx = loadAt("2026-12-15T12:00:00+09:00");
    expect(ctx.subjectExamCountdownHtml("biz-career")).toBe("");
    expect(loadAt("2026-12-16T12:00:00+09:00").subjectExamCountdownHtml("biz-career")).toContain(
      "あと60日"
    );
  });

  test("対象外の科目には何も出さない", () => {
    expect(loadAt("2026-10-03T07:00:00+09:00").subjectExamCountdownHtml("sap")).toBe("");
  });
});
