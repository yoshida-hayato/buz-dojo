// 問題 id が重ならない2科目を、混入検出が写しと取り違えないこと。
//
// 背景は mix-stats-pollution-risk に在る。ミックス出題で2科目が並んで伸びると
// 累計と正解と習得が完全に一致する瞬間が出て、既存の検出が片方の成績を丸ごと
// 空に戻していた。2026-11-14 18:48便 に、問題 id の重なりを見る門を
// _pairIndicatesCopyPollution に入れて閉じた。
//
// この1枚が本番の形を歩く。本番では他科目の全成績 (q 入り) が端末の控えから
// 読めるので、_loadFromKey を差し替えてその口を作る。summary だけを渡す形は
// 従来どおり検出が効く側に倒れる。壊し方の確かめは
// mix-pollution-id-overlap-break に在る。
const helper = require("../test-helpers/mix-pollution-store");

const play = helper.play;
const wipedCount = helper.wipedCount;
const makeStore = helper.makeStore;
const summaryOf = helper.summaryOf;
const PATTERN = helper.PATTERN;
const ID_PERIOD = helper.ID_PERIOD;

describe("約束1: 問題 id が重ならないなら消さない", () => {
  test("並んで伸びた2科目は、累計が完全に一致しても1科目も消えない", () => {
    const { a, b } = play(400, false);
    // まず前提を測る。一致していなければ、この検査は何も見ていない
    expect(a.stats.answered).toBe(b.stats.answered);
    expect(a.stats.correct).toBe(b.stats.correct);
    expect(a.stats.masteredChoice).toBe(b.stats.masteredChoice);
    expect(a.stats.answered).toBeGreaterThan(99);
    expect(wipedCount(400, false)).toBe(0);
  });

  test("成績が空に戻らない", () => {
    const { a, b } = play(400, false);
    const scrubbed = a._scrubPollutedStats("fe-kamoku-b", a.stats, {
      "ap-kamoku-b": summaryOf(b),
    });
    expect(scrubbed.answered).toBe(400);
  });

  test("問題数の多少で結論が変わらない", () => {
    expect(wipedCount(130, false)).toBe(0);
    expect(wipedCount(600, false)).toBe(0);
    expect(wipedCount(900, false)).toBe(0);
  });
});
