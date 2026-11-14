// ミックス出題で2科目の成績が並んで伸びると、既存の「科目間成績コピー混入」の
// 検出が誤って発火し、片方の科目の成績が丸ごと空に戻る。
//
// この1枚は、直しではなく実測の記録である (2026-11-09 06:48便)。
//
// 何を測ったか。本物の QuizStorage.record で2科目に交互に積み、
// 1問ごとに _looksLikeCrossSubjectPollution を呼んだ。正答率が同じなら
// 累計・正解・習得の3つは並んで伸びるので、答えた数が100を超えたあたりで
// 3つが完全に一致する回が出る。一致すると混入と判定され、
// _scrubPollutedStats は空の成績を返す。つまり利用者の成績が消える。
//
// 検出そのものは正しい仕事をしている。「2科目の数が完全に一致するのは、
// 片方がもう片方の写しだからだ」という前提が、ミックス出題が出来た瞬間に
// 嘘になるのである。混ぜれば並んで伸びるのが普通になる。
//
// 分ける手は在る。写しは問題 id まで同じになるが、混ぜた結果は
// 問題 id が1件も重ならない。この1枚はその差も測って残す。
//
// 2026-11-14 18:48便 に閉じた。検出の側に門を2つ入れてある。
// 問題 id が1件も重ならず、かつ累計が自分の q で説明できるなら写しとみなさない。
// だからこの1枚が測った誤爆は、本番の経路では起きない (400問が400問のまま残る)。
//
// それでもこの1枚がいまも通るのは、ここが相手に summary しか渡さず、
// 他科目の q が読めない枝を歩いているからである。読めないときは
// 「否定できない」として従来どおり検出が効く。つまりこの1枚は、
// 直した後も残る保守側の枝の記録である。
//
// 直った側の約束は mix-pollution-id-overlap に在り、
// 壊し方の確かめは mix-pollution-id-overlap-break に在る。
// この1枚を書き替える人は、その2枚を先に読むこと。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const STORAGE = fs.readFileSync(path.join(ROOT, "js", "storage.js"), "utf8");

// 本物の QuizStorage を1つ起こす。控えの保存と段位の塗り直しだけ黙らせる。
function makeStore(subjectId) {
  const ctx = {
    console: { warn() {}, error() {}, log() {} },
    JSON,
    Object,
    Array,
    Number,
    String,
    Math,
    Set,
    Map,
    Date,
  };
  vm.createContext(ctx);
  vm.runInContext(STORAGE + NL + ";globalThis.__S = QuizStorage;", ctx);
  const S = ctx.__S;
  S.subjectId = subjectId;
  S.stats = S._empty();
  S._persist = function () {};
  S._syncRankSnapshot = function () {};
  S._touchLocalSummaryCache = function () {};
  return S;
}

function summaryOf(S) {
  return {
    answered: S.stats.answered,
    correct: S.stats.correct,
    masteredChoice: S.stats.masteredChoice,
    masteredInput: S.stats.masteredInput || 0,
    inputAnswered: S.stats.inputAnswered || 0,
  };
}

// 正答の並び。同じ並びを両方に与えると、累計も正解も習得も並んで伸びる。
// 乱数は使わない (便ごとに結果が変わる検査にしない)。
const PATTERN = [true, true, false, true, true, true, false, true, true, true];
const ROUNDS = 130;
const ID_PERIOD = 40;

function playMixed() {
  const a = makeStore("fe-kamoku-b");
  const b = makeStore("ap-kamoku-b");
  for (let i = 0; i < ROUNDS; i++) {
    const ok = PATTERN[i % PATTERN.length];
    a.record("feb-" + (i % ID_PERIOD), ok, false, "fe-kamoku-b");
    b.record("apb-" + (i % ID_PERIOD), ok, false, "ap-kamoku-b");
  }
  return { a, b };
}

test("ミックスで並んで伸びた2科目は、累計と正解と習得が完全に一致する", () => {
  const { a, b } = playMixed();
  const sa = summaryOf(a);
  const sb = summaryOf(b);
  expect(sa.answered).toBe(sb.answered);
  expect(sa.correct).toBe(sb.correct);
  expect(sa.masteredChoice).toBe(sb.masteredChoice);
  // 検出の下限は 100 である。そこを超えていないと測ったことにならない
  expect(sa.answered).toBeGreaterThan(99);
});

test("そのとき既存の検出は片方を混入と判定し、成績を空に戻す", () => {
  const { a, b } = playMixed();
  const sa = summaryOf(a);
  const sb = summaryOf(b);
  const aPolluted = a._looksLikeCrossSubjectPollution("fe-kamoku-b", a.stats, {
    "ap-kamoku-b": sb,
  });
  const bPolluted = b._looksLikeCrossSubjectPollution("ap-kamoku-b", b.stats, {
    "fe-kamoku-b": sa,
  });
  // どちらか一方が混入と判定される (どちらになるかは優先の判定で決まる)
  expect(aPolluted || bPolluted).toBe(true);
  // 判定された側は、丸ごと空に戻される
  const victim = aPolluted ? a : b;
  const victimId = aPolluted ? "fe-kamoku-b" : "ap-kamoku-b";
  const peers = aPolluted ? { "ap-kamoku-b": sb } : { "fe-kamoku-b": sa };
  const before = summaryOf(victim).answered;
  expect(before).toBeGreaterThan(99);
  const scrubbed = victim._scrubPollutedStats(victimId, victim.stats, peers);
  expect(scrubbed.answered).toBe(0);
  expect(scrubbed.correct).toBe(0);
  expect(scrubbed.masteredChoice).toBe(0);
});

test("写しと混ぜた結果は、問題 id の重なりで分けられる", () => {
  const { a, b } = playMixed();
  const keysA = Object.keys(a.stats.q);
  const keysB = Object.keys(b.stats.q);
  const setA = new Set(keysA);
  let shared = 0;
  for (const k of keysB) {
    if (setA.has(k)) shared += 1;
  }
  expect(keysA.length).toBe(ID_PERIOD);
  expect(keysB.length).toBe(ID_PERIOD);
  // 混ぜた結果は1件も重ならない
  expect(shared).toBe(0);

  // 対照: 本当の写しは、問題 id まで同じになる
  const c = makeStore("fe-kamoku-b");
  const d = makeStore("ap-kamoku-b");
  for (let i = 0; i < ROUNDS; i++) {
    const ok = PATTERN[i % PATTERN.length];
    c.record("same-" + (i % ID_PERIOD), ok, false, "fe-kamoku-b");
    d.record("same-" + (i % ID_PERIOD), ok, false, "ap-kamoku-b");
  }
  const keysC = Object.keys(c.stats.q);
  const setC = new Set(keysC);
  let sharedCopy = 0;
  for (const k of Object.keys(d.stats.q)) {
    if (setC.has(k)) sharedCopy += 1;
  }
  expect(sharedCopy).toBe(ID_PERIOD);
  // いまの検出は、この差を1つも見ていない
  expect(STORAGE.indexOf("_isExactCounterFingerprintMatch")).toBeGreaterThan(-1);
});

test("記述式の答えが記述式を持たない科目へ積まれると、1問で混入と判定される", () => {
  // 第1段が宛先で弾いている形だが、弾かないと何が起きるかを残す。
  // 記述式を持つのは SAP だけなので、1件でも紛れ込むと丸ごと空になる。
  const s = makeStore("ap-kamoku-b");
  s.record("apb-1", true, true, "ap-kamoku-b");
  expect(summaryOf(s).inputAnswered).toBe(1);
  expect(s._looksLikeCrossSubjectPollution("ap-kamoku-b", s.stats, {})).toBe(true);
  const scrubbed = s._scrubPollutedStats("ap-kamoku-b", s.stats, {});
  expect(scrubbed.answered).toBe(0);
  // SAP は記述式を持つので、同じことをしても混入にはならない
  const sap = makeStore("sap");
  sap.record("t-FB50", true, true, "sap");
  expect(sap._looksLikeCrossSubjectPollution("sap", sap.stats, {})).toBe(false);
});
