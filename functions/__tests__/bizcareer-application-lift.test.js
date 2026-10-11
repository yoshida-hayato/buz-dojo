//
// 科目一覧の並びの単体テスト。ビジキャリの申込受付期間中、生産管理の3科目が
// 最上段に来ることを見張る。
//
// なぜ必要か: 申込受付期間 (前期 4/20-7/10、後期 10/5-12/4) は、この3科目に
// 需要が立つ唯一の窓である。以前の examRank は「試験まで14日以内」だけで
// 持ち上げていたので、後期の持ち上がりは 2027-01-31 から、つまり申込が
// 締まった 2026-12-04 の58日あとだった。買える人が居なくなってから
// 最上段に出る形だったので、申込受付期間も持ち上げの条件に足した。
// 条件を戻しても画面は普通に動くため、機械に見張らせる。
//
// 読み込み方: subjects の registry と js の screens-subjects を同じ vm の
// コンテキストに評価する。registry の const は ctx のプロパティには出ないが、
// 同じコンテキストの字句環境に入るので screens 側から見える。
// 時刻は固定した Date をコンテキストに渡して止める。
//
// 添字で書いている箇所があるのは、Slack の自動リンクがドット記法を
// 書き換えるのを避けるため (パッチ経路)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const REGISTRY = fs.readFileSync(path.join(ROOT, "subjects", "registry.js"), "utf8");
const SCREENS = fs.readFileSync(path.join(ROOT, "js", "screens-subjects.js"), "utf8");

const BIZCAREER = ["biz-career", "biz-pm-planning", "biz-pm-operation"];

function orderAt(nowIso) {
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
  const ctx = vm.createContext({ Date: FixedDate, Math, JSON, Intl, console, window: {} });
  vm.runInContext(REGISTRY, ctx, { filename: "registry" });
  vm.runInContext(SCREENS, ctx, { filename: "screens-subjects" });
  return ctx.enabledSubjectsSorted().map(function (s) {
    return s["id"];
  });
}

function topThree(nowIso) {
  return orderAt(nowIso).slice(0, 3);
}

describe("ビジキャリ申込受付期間中は生産管理3科目を最上段に置く", () => {
  test("後期の受付期間の初日・途中・最終日は3科目が先頭", () => {
    expect(topThree("2026-10-05T12:00:00+09:00")).toEqual(BIZCAREER);
    expect(topThree("2026-10-11T12:00:00+09:00")).toEqual(BIZCAREER);
    expect(topThree("2026-12-04T12:00:00+09:00")).toEqual(BIZCAREER);
  });

  test("前期の受付期間の両端も3科目が先頭", () => {
    expect(topThree("2026-04-20T12:00:00+09:00")).toEqual(BIZCAREER);
    expect(topThree("2026-07-10T12:00:00+09:00")).toEqual(BIZCAREER);
  });

  test("受付期間が終われば元の並びに戻る (試験14日前までは持ち上げない)", () => {
    const order = orderAt("2026-12-05T12:00:00+09:00");
    expect(order.indexOf("biz-career")).toBeGreaterThanOrEqual(3);
    expect(order.indexOf("biz-pm-planning")).toBeGreaterThanOrEqual(3);
    expect(order.indexOf("biz-pm-operation")).toBeGreaterThanOrEqual(3);
  });

  test("受付期間の外でも試験14日以内なら従来どおり先頭", () => {
    expect(topThree("2027-01-31T12:00:00+09:00")).toEqual(BIZCAREER);
  });

  test("10科目すべてが並びに残る (持ち上げで落ちない)", () => {
    expect(orderAt("2026-10-11T12:00:00+09:00").length).toBe(10);
    expect(orderAt("2026-12-05T12:00:00+09:00").length).toBe(10);
  });
});
