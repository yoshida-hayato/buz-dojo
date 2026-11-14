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

describe("約束2: 本当の写しは、いまも消す", () => {
  test("問題 id まで同じなら、片方が混入と判定される", () => {
    expect(wipedCount(130, true)).toBe(1);
    expect(wipedCount(400, true)).toBe(1);
    expect(wipedCount(900, true)).toBe(1);
  });

  test("累計だけが他科目のものに膨らんだ写しも消す (q は自分のぶんだけ)", () => {
    const c = helper.counterOnlyCopy();
    // 問題 id は1件も重ならないが、累計が自分の q で説明できない
    expect(c.victim._questionIdOverlap(c.victim.stats, "sap", null).shared).toBe(0);
    expect(c.victim._countersExplainedByOwnQ(c.victim.stats)).toBe(false);
    expect(c.verdict()).toBe(true);
  });

  test("他科目の控えが読めないときは、従来どおり検出が効く", () => {
    const { a, b } = play(400, false);
    a._loadFromKey = function () { return this._empty(); };
    expect(a._questionIdOverlap(a.stats, "ap-kamoku-b", null)).toBe(null);
    expect(
      a._looksLikeCrossSubjectPollution("fe-kamoku-b", a.stats, { "ap-kamoku-b": summaryOf(b) })
    ).toBe(true);
  });

  test("標本が小さい科目では門を開けない (20件未満)", () => {
    // 問題 id の種類が少ないと、重ならないことが写しの否定にならない。
    // 20件未満なら null を返して従来どおりに倒れる
    const localMap = {};
    const s = makeStore("ap-kamoku-b", localMap);
    for (let i = 0; i < 300; i++) {
      s.record("apb-" + (i % 10), PATTERN[i % PATTERN.length], false, "ap-kamoku-b");
    }
    expect(Object.keys(s.stats.q).length).toBe(10);
    expect(s._questionIdOverlap(s.stats, "fe-kamoku-b", null)).toBe(null);
  });

  test("自分の q が渡されていない成績は門を開けない", () => {
    const { a, b } = play(400, false);
    const summaryOnly = summaryOf(a);
    expect(a._questionIdOverlap(summaryOnly, "ap-kamoku-b", null)).toBe(null);
    expect(a._questionIdsProveNotCopy(summaryOnly, "ap-kamoku-b", null)).toBe(false);
    expect(ID_PERIOD).toBe(40);
    expect(b.stats.answered).toBe(400);
  });
});

describe("約束3: 科目一覧を開いたときの reconcile でも消さない", () => {
  // 本番で混入検出が走るもう1つの口。screens-subjects と screens-stats が
  // 問題マスタを読んだ後に reconcileForSubject を呼ぶ。ここは累計だけの
  // 写し (before) を渡していたので、q が見えず門が開かなかった
  function openSubjectList(rounds, sameIds) {
    const r = play(rounds, sameIds);
    const a = r.a;
    a._collectPeerSummaries = function () {
      return { "ap-kamoku-b": summaryOf(r.b) };
    };
    const ids = new Set(Object.keys(a.stats.q));
    const before = a.stats.answered;
    a.reconcileForSubject(ids, null);
    return { before, after: a.stats.answered };
  }

  test("並んで伸びた2科目は、科目一覧を開いても成績が残る", () => {
    const r = openSubjectList(400, false);
    expect(r.before).toBe(400);
    expect(r.after).toBe(400);
  });

  test("本当の写しは、科目一覧を開いた時点で消える", () => {
    const r = openSubjectList(400, true);
    expect(r.before).toBe(400);
    expect(r.after).toBe(0);
  });

  test("累計だけが膨らんだ写しも消える", () => {
    const c = helper.counterOnlyCopy();
    const a = c.victim;
    a._collectPeerSummaries = function () {
      return { sap: summaryOf(c.peer) };
    };
    expect(a.stats.answered).toBe(400);
    a.reconcileForSubject(new Set(Object.keys(a.stats.q)), null);
    expect(a.stats.answered).toBe(0);
  });
});
