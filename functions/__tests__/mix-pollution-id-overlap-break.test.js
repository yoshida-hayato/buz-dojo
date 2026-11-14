// 混入検出に入れた門が、本当に効いていることの確かめ。
//
// 字面が在るかを見るのではなく、その行を抜いた (あるいは素通りにした)
// storage.js を vm で実際に走らせて、結論が変わることを見る。
// 失敗の型7 (見張りを語が在るかで書く) と 型20 (壊したつもりで壊していない) の
// 対策である。壊し方が効いていないと「捕まらない」と出るので、
// 壊した字面が本当に減ったことも毎回測る。
const helper = require("../test-helpers/mix-pollution-store");

const STORAGE = helper.STORAGE;
const play = helper.play;
const wipedCount = helper.wipedCount;
const summaryOf = helper.summaryOf;
const counterOnlyCopy = helper.counterOnlyCopy;

// needle を to に書き替えた字面を返す。置換が本当に当たったことを測ってから返す
function rewrite(needle, to) {
  expect(STORAGE.indexOf(needle)).toBeGreaterThan(-1);
  const broken = STORAGE.split(needle).join(to);
  expect(broken).not.toBe(STORAGE);
  return broken;
}

const GATE_PAIR =
  "if (this._questionIdsProveNotCopy(candidate, sourceId, peersById)) return false;";
const GATE_NEAR =
  "if (this._questionIdsProveNotCopy(stats, peerId, peersById)) continue;";

test("写しの門を抜くと、並んで伸びた2科目で1科目が消える", () => {
  const broken = rewrite(GATE_PAIR, "");
  expect(wipedCount(400, false, broken)).toBe(1);
  // 対照: 門が在れば0件である
  expect(wipedCount(400, false)).toBe(0);
});

test("門を常に偽にしても消える (門が条件で効いていることの確かめ)", () => {
  const broken = rewrite(
    "if (overlap.shared > 0) return false;",
    "if (overlap.shared >= 0) return false;"
  );
  expect(wipedCount(400, false, broken)).toBe(1);
});

test("累計の検算を素通りにすると、累計だけの写しを見逃す", () => {
  const broken = rewrite("return this._countersExplainedByOwnQ(stats);", "return true;");
  expect(counterOnlyCopy(broken).verdict()).toBe(false);
  // 対照: 検算が在れば写しと判定する
  expect(counterOnlyCopy().verdict()).toBe(true);
});

test("控えが読めないときに重なり0と答えると、控えが無い科目を消さなくなる", () => {
  // 読めない (null) と 重なっていない (shared が0) を混ぜる壊し方である。
  // 効いているのは鍵の下限の行で、peerQ が無い側の行は本番では通らない
  // (_loadFromKey が空の成績を返し、その q は空の器なので真である)。
  // だから下限の行を外すのが、この門を本当に壊す手になる
  const broken = rewrite("if (peerKeys.length < 20) return null;", "");
  const r = play(400, false, broken);
  r.a._loadFromKey = function () { return this._empty(); };
  expect(r.a._questionIdOverlap(r.a.stats, "ap-kamoku-b", null).peer).toBe(0);
  expect(
    r.a._looksLikeCrossSubjectPollution("fe-kamoku-b", r.a.stats, {
      "ap-kamoku-b": summaryOf(r.b),
    })
  ).toBe(false);
  // 対照: 本物は読めない科目を従来どおり消す
  const ok = play(400, false);
  ok.a._loadFromKey = function () { return this._empty(); };
  expect(ok.a._questionIdOverlap(ok.a.stats, "ap-kamoku-b", null)).toBe(null);
  expect(
    ok.a._looksLikeCrossSubjectPollution("fe-kamoku-b", ok.a.stats, {
      "ap-kamoku-b": summaryOf(ok.b),
    })
  ).toBe(true);
});

test("自分の側の標本の下限を外すと、問題 id が数件でも門が開く", () => {
  const few = { answered: 400, correct: 320, masteredChoice: 32, q: {} };
  for (let i = 0; i < 30; i++) few.q["x-" + i] = { a: 1, c: 1 };
  const ok = play(400, false);
  const tiny = ok.a._empty();
  tiny.q = { "y-1": { a: 200, c: 160 } };
  tiny.answered = 200;
  tiny.correct = 160;
  expect(ok.a._questionIdOverlap(tiny, "zz-none", { "zz-none": few })).toBe(null);
  const broken = rewrite("if (mineKeys.length < 20) return null;", "");
  const r = play(400, false, broken);
  expect(r.a._questionIdOverlap(tiny, "zz-none", { "zz-none": few }).shared).toBe(0);
});

test("近傍一致の側の門も効いている", () => {
  // 900問ずつ積むと両方 answered 900 で、近傍一致の下限 (500) を超える。
  // 習得は問題 id の種類数で頭打ちになるので、実測した値をそのまま相手に渡す
  const ref = play(900, false);
  const peer = {
    answered: ref.b.stats.answered,
    correct: ref.b.stats.correct,
    masteredChoice: ref.b.stats.masteredChoice,
  };
  expect(peer.answered).toBe(900);
  expect(ref.a._isNearCounterFingerprintMatch(ref.a.stats, peer)).toBe(true);
  const broken = rewrite(GATE_NEAR, "");
  const r = play(900, false, broken);
  expect(r.a._looksLikeNearCloneOfPeers(r.a.stats, "fe-kamoku-b", { "ap-kamoku-b": peer })).toBe(true);
  // 対照: 門が在れば写しとみなさない
  expect(ref.a._looksLikeNearCloneOfPeers(ref.a.stats, "fe-kamoku-b", { "ap-kamoku-b": peer })).toBe(false);
});

test("呼び元が控えの一覧を渡していること", () => {
  // peersById を渡さなくても端末の控えから読める形にしてあるが、
  // 渡す口が消えると、一括判定のときに q を取り違える余地が出る
  const broken = rewrite(
    "this._pairIndicatesCopyPollution(subjectId, stats, peerId, peer, peersById)",
    "this._pairIndicatesCopyPollution(subjectId, stats, peerId, peer)"
  );
  const r = play(400, false, broken);
  const peerWithQ = { answered: 400, correct: 320, masteredChoice: 32, q: r.b.stats.q };
  // 控えの口を閉じると、渡された q が使われないので従来どおり消す側に倒れる
  r.a._loadFromKey = function () { return this._empty(); };
  expect(
    r.a._looksLikeCrossSubjectPollution("fe-kamoku-b", r.a.stats, { "ap-kamoku-b": peerWithQ })
  ).toBe(true);
  const ok = play(400, false);
  ok.a._loadFromKey = function () { return this._empty(); };
  expect(
    ok.a._looksLikeCrossSubjectPollution("fe-kamoku-b", ok.a.stats, { "ap-kamoku-b": peerWithQ })
  ).toBe(false);
});

test("reconcile が累計だけの写しを渡す形に戻すと、科目一覧で成績が消える", () => {
  // q を持たない before を渡すと門が開かない。18:48便 がこれで400問を0問にした
  const broken = rewrite(
    "if (this._looksLikeSapPollution(this.subjectId, s)) {",
    "if (this._looksLikeSapPollution(this.subjectId, before)) {"
  );
  const r = play(400, false, broken);
  r.a._collectPeerSummaries = function () {
    return { "ap-kamoku-b": summaryOf(r.b) };
  };
  expect(r.a.stats.answered).toBe(400);
  r.a.reconcileForSubject(new Set(Object.keys(r.a.stats.q)), null);
  expect(r.a.stats.answered).toBe(0);
  // 対照: 本物は残す
  const ok = play(400, false);
  ok.a._collectPeerSummaries = function () {
    return { "ap-kamoku-b": summaryOf(ok.b) };
  };
  ok.a.reconcileForSubject(new Set(Object.keys(ok.a.stats.q)), null);
  expect(ok.a.stats.answered).toBe(400);
});
