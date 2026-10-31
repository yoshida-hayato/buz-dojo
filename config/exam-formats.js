// 模試モードの試験形式の正本。
//
// なぜ要るか: 資格の対策商品なのに、本番の形を一度も再現できなかった。
// 出題数は 10/20/30/全問 で、時間の制限は無く、合否の線も無い。
// 本番は 40問を110分で解き、概ね6割で合格する。練習の点数が本番の合否に
// 何を意味するのかを、利用者は自分で換算するしかなかった。
//
// 数字の出どころ: 中央職業能力開発協会が公表しているビジネスキャリア検定の
// 2級の形式 (5肢択一 / 40問 / 110分 / 概ね60パーセント以上の正答で合格)。
// 2026-10-19 に主催者の公式サイトの日程一覧・受験申請の頁・公式パンフレットの
// 3つで一致を確認した。生産管理分野だけの例外は公表されていない。
//
// 形式が公表されている科目だけが模試を持つ。表に無い科目では模試の面を
// 出さない (本番の形が分からない科目で「模試」と名乗らないため)。
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ExamFormats = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BIZCAREER_GRADE2 = {
    examName: "ビジネスキャリア検定2級",
    questionCount: 40,
    minutes: 110,
    passPercent: 60,
    choiceCount: 5,
    confirmedOn: "2026-10-19",
    authority: "中央職業能力開発協会",
  };

  const EXAM_FORMATS = {
    "biz-career": BIZCAREER_GRADE2,
    "biz-pm-planning": BIZCAREER_GRADE2,
    "biz-pm-operation": BIZCAREER_GRADE2,
  };

  function formatFor(subjectId) {
    if (!subjectId) return null;
    return EXAM_FORMATS[subjectId] || null;
  }

  function hasExam(subjectId) {
    return !!formatFor(subjectId);
  }

  function timeLimitMs(subjectId) {
    const f = formatFor(subjectId);
    if (!f) return 0;
    return f.minutes * 60000;
  }

  // 合否。「概ね60パーセント以上」なので、ちょうど60パーセントは合格に数える。
  // 判定は正答数そのもので行う。表示用に丸めた百分率で判定すると、
  // 丸めで境界が1問ぶんずれる。
  function isPass(correct, total, passPercent) {
    const n = Number(total) || 0;
    if (n <= 0) return false;
    const want = Number(passPercent);
    const line = Number.isFinite(want) ? want : 60;
    const scored = (Number(correct) || 0) * 100;
    return scored >= line * n;
  }

  function passedExam(subjectId, correct, total) {
    const f = formatFor(subjectId);
    if (!f) return false;
    return isPass(correct, total, f.passPercent);
  }

  // 何問正解すれば合格かを返す。模試の面と結果の面が同じ数を出すための1箇所。
  function passingCorrectCount(subjectId, total) {
    const f = formatFor(subjectId);
    if (!f) return 0;
    const n = Number(total) || 0;
    if (n <= 0) return 0;
    return Math.ceil((f.passPercent * n) / 100);
  }

  // 残り時間の表示。分と秒を2桁で返す。負の値は 00:00 に丸める。
  function formatRemaining(ms) {
    let sec = Math.floor((Number(ms) || 0) / 1000);
    if (sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    const pad = (v) => (v < 10 ? "0" + String(v) : String(v));
    return pad(m) + ":" + pad(s);
  }

  return {
    EXAM_FORMATS,
    formatFor,
    hasExam,
    timeLimitMs,
    isPass,
    passedExam,
    passingCorrectCount,
    formatRemaining,
  };
});
