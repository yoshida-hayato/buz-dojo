/** 読み物レッスン（Phase3 パイロット） */

let _lessonChapterId = null;
let _lessonQuizIndex = 0;

function lessonQuestionById(id) {
  if (typeof QUIZ_DATA === "undefined" || !id) return null;
  return QUIZ_DATA.find((q) => q && q.id === id) || null;
}

function urlPreviewWhyRequested() {
  try {
    return new URLSearchParams(location.search).get("preview") === "why";
  } catch (e) {
    return false;
  }
}

/** ホーム戻り・読了後は再読込で先読み直開きしない */
function clearPreviewWhyFromUrl() {
  if (!urlPreviewWhyRequested()) return;
  try {
    const p = new URLSearchParams(location.search);
    p.delete("preview");
    const q = p.toString();
    history.replaceState(
      null,
      "",
      location.pathname + (q ? "?" + q : "") + (location.hash || "")
    );
  } catch (e) {
    /* ignore */
  }
}

/** ?preview=why — 第2章読み物の先読み（why 未収録時はホームで準備中表示） */
function previewWhyLessonPending() {
  if (!CURRENT_SUBJECT || CURRENT_SUBJECT.id !== "ai-ontology-intro") return false;
  if (!urlPreviewWhyRequested()) return false;
  return !LessonProgress.chapterLesson("why");
}

function tryPreviewWhyLessonFromUrl() {
  if (!CURRENT_SUBJECT || CURRENT_SUBJECT.id !== "ai-ontology-intro") return false;
  if (!urlPreviewWhyRequested()) return false;
  if (!LessonProgress.hasLesson(CURRENT_SUBJECT)) return false;
  if (!LessonProgress.chapterLesson("why")) return false;
  openLesson("why");
  return true;
}

/** ホーム第1章→第2章の試し読み深リンク（告知なしURL・ホーム一覧には出さない） */
function previewWhyTrialHref() {
  try {
    const p = new URLSearchParams(location.search);
    p.set("subject", "ai-ontology-intro");
    p.set("preview", "why");
    const q = p.toString();
    return location.pathname + (q ? "?" + q : "");
  } catch (e) {
    return "/?subject=ai-ontology-intro&preview=why";
  }
}

function previewWhyTrialAvailable() {
  if (!CURRENT_SUBJECT || CURRENT_SUBJECT.id !== "ai-ontology-intro") return false;
  if (typeof LessonProgress === "undefined" || !LessonProgress.hasLesson(CURRENT_SUBJECT)) {
    return false;
  }
  return !!LessonProgress.chapterLesson("why");
}

/** why レッスン sections から読み物・確認クイズ数（6 固定廃止） */
function previewWhyLessonStepCounts(subject) {
  let readings = 0;
  let quizzes = 0;
  if (subject && typeof LessonProgress !== "undefined" && LessonProgress.hasLesson(subject)) {
    const lesson = LessonProgress.chapterLesson("why");
    const sections = lesson && lesson.sections ? lesson.sections : [];
    for (let i = 0; i < sections.length; i++) {
      const k = sections[i] && sections[i].kind;
      if (k === "reading") readings += 1;
      else if (k === "quiz") quizzes += 1;
    }
  }
  return { readings, quizzes };
}

function syncLessonPreviewNotice() {
  const card = document.querySelector("#screen-lesson .lesson-card");
  if (!card) return;
  let el = $("lesson-preview-notice");
  const show =
    urlPreviewWhyRequested() &&
    _lessonChapterId === "why" &&
    CURRENT_SUBJECT &&
    CURRENT_SUBJECT.id === "ai-ontology-intro";
  if (!show) {
    if (el) el.classList.add("hidden");
    return;
  }
  if (!el) {
    el = document.createElement("p");
    el.id = "lesson-preview-notice";
    el.className = "lesson-preview-notice";
    const titleEl = $("lesson-title");
    if (titleEl) card.insertBefore(el, titleEl);
  }
  el.classList.remove("hidden");
  const stepCounts = previewWhyLessonStepCounts(CURRENT_SUBJECT);
  const whyCh =
    typeof ChapterProgress !== "undefined"
      ? ChapterProgress.getChapter(CURRENT_SUBJECT, "why")
      : null;
  const chapterNeed = whyCh ? Number(whyCh.clearCorrect) || 0 : 0;
  const bannerProgressNeed =
    stepCounts.quizzes > 0
      ? stepCounts.quizzes
      : chapterNeed > 0
        ? chapterNeed
        : 0;
  const stepIntro =
    stepCounts.readings > 0 && stepCounts.quizzes > 0
      ? "第2章の試し読みです。読み物" +
        stepCounts.readings +
        "回とそのあとの確認クイズ" +
        stepCounts.quizzes +
        "問まで進められます。"
      : "第2章の試し読みです。第2章の読み物と確認クイズまで進められます。";
  if (previewWhyChapter2LockedByIntro(CURRENT_SUBJECT)) {
    el.textContent =
      stepIntro +
      "第1章を完了していない間は、確認クイズに正解しても科目ホームの「第2章」の進みには載りません。" +
      PREVIEW_WHY_CH1_LOCKED_TAIL;
  } else {
    const progressTail =
      bannerProgressNeed > 0
        ? `確認クイズに正解した分は科目ホームの「第2章」の進み（${bannerProgressNeed}/${bannerProgressNeed}まで）に載り、`
        : "確認クイズに正解した分は科目ホームの「第2章」の進みに載り、";
    const quizClear =
      stepCounts.quizzes > 0
        ? `${stepCounts.quizzes}問すべて正解すれば第2章を完了した扱いになります。`
        : "確認クイズをすべて正解すれば第2章を完了した扱いになります。";
    el.textContent =
      stepIntro + progressTail + quizClear + "第1章を終えていなくても、ここでは読み進められます。";
  }
}

const PREVIEW_WHY_CH1_LOCKED_TAIL =
  "第1章を完了していないため、第2章の残りクイズには今は進めません。先に第1章をホームから完了してください。";

/** 第1章未完了のため why 章の recordCorrect が載らない状態 */
function previewWhyChapter2LockedByIntro(subject) {
  if (
    !subject ||
    typeof ChapterProgress === "undefined" ||
    !ChapterProgress.hasTextbook(subject)
  ) {
    return false;
  }
  const progress = ChapterProgress.load(subject);
  return !ChapterProgress.isUnlocked(subject, progress, "why");
}

function openLesson(chapterId) {
  if (!CURRENT_SUBJECT || !LessonProgress.hasLesson(CURRENT_SUBJECT)) return;
  const lesson = LessonProgress.chapterLesson(chapterId);
  if (!lesson) {
    showScreen("home");
    return;
  }
  _lessonChapterId = chapterId;
  _lessonQuizIndex = 0;
  const subLabel = $("lesson-subject-label");
  if (subLabel && CURRENT_SUBJECT) {
    subLabel.textContent = CURRENT_SUBJECT.shortTitle || CURRENT_SUBJECT.title || "";
  }
  renderLessonScreen();
  showScreen("lesson");
}

function renderLessonScreen() {
  const lesson = LessonProgress.chapterLesson(_lessonChapterId);
  if (!lesson || !CURRENT_SUBJECT) return;

  const titleEl = $("lesson-title");
  const progressEl = $("lesson-progress-label");
  const bodyEl = $("lesson-body");
  const actionsEl = $("lesson-actions");
  if (!titleEl || !bodyEl || !actionsEl) return;

  syncLessonPreviewNotice();

  const sections = lesson.sections || [];
  const st = LessonProgress.chapterState(CURRENT_SUBJECT, _lessonChapterId);
  let idx = Math.min(st.sectionIndex, Math.max(0, sections.length - 1));
  const sec = sections[idx];
  if (!sec) return;

  const chMeta =
    typeof ChapterProgress !== "undefined" && CURRENT_SUBJECT
      ? ChapterProgress.getChapter(CURRENT_SUBJECT, _lessonChapterId)
      : null;
  const onChapterLessonPilot = !!chMeta && !!LessonProgress.chapterLesson(_lessonChapterId);
  if (onChapterLessonPilot) {
    titleEl.textContent =
      lesson.title || `第${chMeta.order}章 ${chMeta.module}`;
  } else {
    titleEl.textContent = sec.title || lesson.title;
  }
  progressEl.textContent = `ステップ ${idx + 1}/${sections.length}`;

  bodyEl.innerHTML = "";
  if (onChapterLessonPilot && sec.kind === "reading" && sec.title) {
    const secHeading = document.createElement("p");
    secHeading.className = "lesson-section-heading";
    secHeading.textContent = sec.title;
    bodyEl.appendChild(secHeading);
  }
  actionsEl.innerHTML = "";

  if (sec.kind === "reading") {
    const paras = String(sec.body || "")
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    paras.forEach((p) => {
      const el = document.createElement("p");
      el.className = "lesson-paragraph";
      el.textContent = p;
      bodyEl.appendChild(el);
    });
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "primary-btn";
    nextBtn.textContent = idx < sections.length - 1 ? "次へ" : "章の読み物を終える";
    nextBtn.addEventListener("click", () => {
      LessonProgress.markSectionDone(
        CURRENT_SUBJECT,
        _lessonChapterId,
        sec.id,
        idx + 1
      );
      if (idx >= sections.length - 1) {
        finishLessonFlow();
        return;
      }
      renderLessonScreen();
    });
    actionsEl.appendChild(nextBtn);
    return;
  }

  if (sec.kind === "quiz") {
    const ids = sec.questionIds || [];
    const qid = ids[_lessonQuizIndex] || ids[0];
    const q = lessonQuestionById(qid);
    if (!q) {
      bodyEl.textContent = "問題を読み込めませんでした。ホームに戻ってください。";
      return;
    }
    const prompt = document.createElement("p");
    prompt.className = "lesson-quiz-prompt";
    prompt.textContent = q.name || q.question || "";
    bodyEl.appendChild(prompt);

    const list = document.createElement("ul");
    list.className = "lesson-choice-list";
    list.setAttribute("role", "list");
    const feedback = document.createElement("p");
    feedback.className = "lesson-quiz-feedback hidden";

    (q.choices || []).forEach((choice, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-choice-btn";
      btn.textContent = choice;
      btn.addEventListener("click", () => {
        list.querySelectorAll("button").forEach((b) => {
          b.disabled = true;
        });
        const correct = String(choice) === String(q.answer);
        feedback.classList.remove("hidden");
        if (correct) {
          feedback.textContent = "正解です。";
          feedback.classList.add("is-correct");
          if (typeof ChapterProgress !== "undefined") {
            ChapterProgress.recordCorrect(CURRENT_SUBJECT, q.id, q.module);
          }
          const cont = document.createElement("button");
          cont.type = "button";
          cont.className = "primary-btn";
          cont.textContent =
            _lessonQuizIndex < ids.length - 1
              ? "次の確認へ"
              : idx < sections.length - 1
                ? "次のステップへ"
                : "章の読み物を終える";
          cont.addEventListener("click", () => {
            if (_lessonQuizIndex < ids.length - 1) {
              _lessonQuizIndex += 1;
              renderLessonScreen();
              return;
            }
            _lessonQuizIndex = 0;
            LessonProgress.markSectionDone(
              CURRENT_SUBJECT,
              _lessonChapterId,
              sec.id,
              idx + 1
            );
            if (idx >= sections.length - 1) {
              finishLessonFlow();
              return;
            }
            renderLessonScreen();
          });
          actionsEl.appendChild(cont);
        } else {
          feedback.textContent = "もう一度選んでください。";
          feedback.classList.add("is-wrong");
          list.querySelectorAll("button").forEach((b) => {
            b.disabled = false;
          });
        }
        if (q.explanation) {
          const exp = document.createElement("p");
          exp.className = "lesson-quiz-explanation";
          exp.textContent = q.explanation;
          bodyEl.appendChild(exp);
        }
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    bodyEl.appendChild(list);
    bodyEl.appendChild(feedback);
  }
}

function introLessonReachHint(subject, chapterId) {
  if (
    chapterId !== "intro" ||
    !subject ||
    typeof ChapterProgress === "undefined" ||
    typeof LessonProgress === "undefined" ||
    !LessonProgress.hasLesson(subject) ||
    !LessonProgress.lessonComplete(subject, "intro")
  ) {
    return "";
  }
  const introCh = ChapterProgress.getChapter(subject, "intro");
  if (!introCh || ChapterProgress.isCleared(ChapterProgress.load(subject), introCh.id)) {
    return "";
  }
  const progress = ChapterProgress.load(subject);
  const got = ChapterProgress.correctCount(progress, introCh.id);
  const need = Number(introCh.clearCorrect) || 0;
  return (
    `読み物パートは終わりました。` +
    `第1章の到達 ${Math.min(got, need)}/${need} は、章クリア用の別カウントです。` +
    `レッスン内の確認クイズと「この章を続ける」の正解も、到達に数えられます。`
  );
}

function whyLessonReachHint(subject) {
  if (
    !subject ||
    typeof ChapterProgress === "undefined" ||
    typeof LessonProgress === "undefined" ||
    !LessonProgress.hasLesson(subject) ||
    !LessonProgress.lessonComplete(subject, "why")
  ) {
    return "";
  }
  const whyCh = ChapterProgress.getChapter(subject, "why");
  if (!whyCh) return "";
  const progress = ChapterProgress.load(subject);
  if (ChapterProgress.isCleared(progress, whyCh.id)) {
    const need = Number(whyCh.clearCorrect) || 0;
    const clearedLabel = need > 0 ? `${need}/${need}` : "完了";
    return (
      "読み物と確認クイズはここまで完了です。" +
      `第2章は完了しました（${clearedLabel}）。` +
      "科目ホームで進みを確認してください。"
    );
  }
  const got = ChapterProgress.correctCount(progress, whyCh.id);
  const need = Number(whyCh.clearCorrect) || 0;
  const locked = !ChapterProgress.isUnlocked(subject, progress, whyCh.id);
  if (locked) {
    const stepCounts = previewWhyLessonStepCounts(subject);
    const qN =
      stepCounts.quizzes > 0 ? stepCounts.quizzes : need > 0 ? need : 0;
    const previewQuizDone =
      qN > 0
        ? `試し読みの確認${qN}問は終えましたが、`
        : "試し読みはここまで終えましたが、";
    return (
      "読み物と確認クイズはここまで完了です。" +
      previewQuizDone +
      "科目ホームの第2章の進みには載っていません。" +
      "第1章を完了すると、第2章の学習をホームから続けられます。"
    );
  }
  const remain = Math.max(0, need - got);
  let msg = "読み物と確認クイズはここまで完了です。";
  if (remain <= 0) {
    msg += " 第2章の到達条件を満たしました。";
  } else if (remain === 1) {
    msg += " 第2章を完了するには、あと1問正解が必要です。科目ホームの第2章から続けてください。";
  } else {
    msg +=
      ` 第2章を完了するには、あと${remain}問正解が必要です。科目ホームの第2章から続けてください。`;
  }
  return msg;
}

function finishLessonFlow() {
  if (
    _lessonChapterId === "intro" &&
    typeof homeChapterSelectedId !== "undefined"
  ) {
    homeChapterSelectedId = "intro";
  }
  if (
    _lessonChapterId === "why" &&
    typeof homeChapterSelectedId !== "undefined"
  ) {
    homeChapterSelectedId = "why";
  }
  clearPreviewWhyFromUrl();
  if (typeof updateHomeNote === "function") updateHomeNote();
  showScreen("home");
  const hint = $("home-chapter-hint");
  let reachHint = "";
  if (CURRENT_SUBJECT && _lessonChapterId === "intro") {
    reachHint = introLessonReachHint(CURRENT_SUBJECT, "intro");
  } else if (CURRENT_SUBJECT && _lessonChapterId === "why") {
    reachHint = whyLessonReachHint(CURRENT_SUBJECT);
  }
  if (hint && reachHint) {
    hint.textContent = reachHint;
  }
}

function wireLessonUiOnce() {
  const back = $("lesson-back-btn");
  if (back && !back.dataset.wired) {
    back.dataset.wired = "1";
    back.addEventListener("click", () => {
      clearPreviewWhyFromUrl();
      showScreen("home");
    });
  }
}

document.addEventListener("DOMContentLoaded", wireLessonUiOnce);
