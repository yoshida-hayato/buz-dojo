// 本番形式の模試。形式の数字 (問数・分・合格ライン・選択肢の数) と出どころは
// config/exam-formats.js が持つ。ここは画面と進行だけを受け持つ。
//
// なぜ要るか: 資格の対策商品なのに、本番の形を一度も再現できなかった。
// 出題数は 10/20/30/全問 で、時間の制限が無く、合否の線も無い。利用者は
// 練習の点数が本番の合否に何を意味するのかを、自分で換算するしかなかった。
//
// 無料枠との関係: 模試は1回で40問を通して解くので、1日20問の無料枠では
// 成立しない。購入者 (と無料科目) だけが受けられ、他の人には鍵を掛ける。
const ExamMode = (function () {
  let timerId = null;
  let deadline = 0;
  let startedAt = 0;
  const el = (id) => document.getElementById(id);
  function currentFormat() {
    if (typeof CURRENT_SUBJECT === "undefined" || !CURRENT_SUBJECT) return null;
    if (typeof ExamFormats === "undefined") return null;
    return ExamFormats.formatFor(CURRENT_SUBJECT.id);
  }
  function hasAccessNow() {
    if (typeof Entitlement === "undefined" || !currentFormat()) return false;
    try {
      return !!Entitlement.hasAccess(CURRENT_SUBJECT.id);
    } catch (e) {
      return false;
    }
  }
  const isExamQuiz = () =>
    typeof quiz !== "undefined" && !!quiz && !!(quiz.settings && quiz.settings.examMode);
  function paintCard() {
    const card = el("exam-card");
    if (!card) return;
    const f = currentFormat();
    if (!f) return card.classList.add("hidden");
    const need = ExamFormats.passingCorrectCount(CURRENT_SUBJECT.id, f.questionCount);
    const spec = el("exam-card-spec");
    if (spec) {
      spec.textContent = [
        f.examName + "と同じ" + f.questionCount + "問・" + f.minutes + "分で解きます。",
        need + "問 (" + f.passPercent + "パーセント) 以上で合格。",
        "正誤と解説は、1問ごとではなく採点のあとにまとめて出ます。",
        "選択肢の数は本番の" + f.choiceCount + "つにそろえます（正誤問題など、形式が決まっているものはそのままです）。",
      ].join("");
    }
    const ok = hasAccessNow();
    const startBtn = el("exam-start-btn");
    if (startBtn) startBtn.classList.toggle("hidden", !ok);
    const buyBtn = el("exam-buy-btn");
    if (buyBtn) buyBtn.classList.toggle("hidden", ok);
    const note = el("exam-card-note");
    if (note) {
      note.textContent = ok
        ? ""
        : "模試は" + f.questionCount + "問を通して解くので、1日20問の無料枠では受けられません。";
    }
    card.classList.toggle("is-locked", !ok);
    card.classList.remove("hidden");
  }

  // 模試の出題設定。ホームの出題設定は読まない (本番は絞り込みが無い)。
  function settingsForExam() {
    const f = currentFormat();
    if (!f) return null;
    const cats = [];
    if (typeof QUIZ_DATA !== "undefined" && Array.isArray(QUIZ_DATA)) {
      QUIZ_DATA.forEach(function (q) {
        if (q && q.category && cats.indexOf(q.category) < 0) cats.push(q.category);
      });
    }
    const usesDirection =
      typeof subjectUsesDirection === "function" ? subjectUsesDirection() : false;
    return {
      categories: cats,
      modules: "all",
      priorities: [1, 2, 3],
      direction: usesDirection ? "mixed" : "name2code",
      count: f.questionCount,
      answerMode: "choice",
      poolMode: "all",
      choiceCount: f.choiceCount,
      examMode: true,
    };
  }
  function start() {
    if (!currentFormat()) return;
    if (!hasAccessNow()) {
      paintCard();
      return;
    }
    const settings = settingsForExam();
    if (!settings) return;
    if (typeof startQuiz !== "function") return;
    startQuiz(settings);
  }

  // クイズ側から呼ばれる。quiz が組み終わった時点で時計を起こす。
  function begin() {
    stop();
    const f = currentFormat();
    if (!f) return;
    startedAt = Date.now();
    deadline = startedAt + ExamFormats.timeLimitMs(CURRENT_SUBJECT.id);
    const box = el("exam-timer");
    if (box) box.classList.remove("hidden");
    tick();
    if (typeof setInterval === "function") timerId = setInterval(tick, 1000);
  }
  function stop() {
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
    const box = el("exam-timer");
    if (box) box.classList.add("hidden");
  }
  const remainingMs = () => (deadline ? deadline - Date.now() : 0);
  function tick() {
    const left = remainingMs();
    const box = el("exam-timer");
    if (box) {
      box.textContent = "残り " + ExamFormats.formatRemaining(left);
      box.classList.toggle("is-urgent", left <= 300000);
    }
    if (left <= 0) finishByTimeout();
  }

  // 時間切れ。残りは未回答として誤答一覧に入れるが、成績には記録しない
  // (解かなかった問題で習得の状態を下げないため)。解説はこの一覧で読める。
  function finishByTimeout() {
    stop();
    if (!isExamQuiz()) return;
    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      if (!q || q._answered) continue;
      q._answered = true;
      q.timedOut = true;
      quiz.wrongs.push({ q: q, given: "（時間切れ・未回答）" });
    }
    quiz.idx = quiz.questions.length - 1;
    if (typeof clearFeedbackCard === "function") clearFeedbackCard();
    if (typeof renderResult === "function") renderResult();
    if (typeof showScreen === "function") showScreen("result");
  }
  const elapsedSec = () =>
    startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;

  // 結果画面の合否。模試でないときは何も出さない。
  function paintVerdict() {
    const box = el("exam-verdict");
    if (!box) return;
    if (!isExamQuiz() || typeof ExamFormats === "undefined" || !CURRENT_SUBJECT) {
      box.classList.add("hidden");
      box.classList.remove("is-pass", "is-fail");
      return;
    }
    stop();
    const subjectId = CURRENT_SUBJECT.id;
    const f = ExamFormats.formatFor(subjectId);
    if (!f) return box.classList.add("hidden");
    const total = quiz.questions.length;
    const correct = quiz.correctCount;
    const pass = ExamFormats.passedExam(subjectId, correct, total);
    const need = ExamFormats.passingCorrectCount(subjectId, total);
    const used = elapsedSec();
    const min = Math.floor(used / 60);
    const sec = used - min * 60;
    box.textContent =
      (pass ? "合格" : "不合格") +
      " — " + f.examName + "の基準は" + total + "問中" + need + "問。" +
      "今回は" + correct + "問正解、所要" + min + "分" + sec + "秒。";
    box.classList.toggle("is-pass", pass);
    box.classList.toggle("is-fail", !pass);
    box.classList.remove("hidden");
  }
  function bind() {
    const s = el("exam-start-btn");
    if (s && !s.dataset.bound) {
      s.dataset.bound = "1";
      s.addEventListener("click", start);
    }
    const b = el("exam-buy-btn");
    if (b && !b.dataset.bound) {
      b.dataset.bound = "1";
      b.addEventListener("click", function () {
        if (typeof Billing === "undefined") return;
        if (typeof CURRENT_SUBJECT === "undefined" || !CURRENT_SUBJECT) return;
        Billing.startCheckout("subject", CURRENT_SUBJECT.id);
      });
    }
  }
  return {
    paintCard: () => { bind(); paintCard(); },
    settingsForExam, start, begin, stop, tick,
    remainingMs, finishByTimeout, paintVerdict, isExamQuiz,
  };
})();
