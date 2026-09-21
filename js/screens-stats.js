/** 成績画面（アプリ側ラッパ） */

// ===== 成績画面 =====
function renderStats() {
  void renderStatsAsync();
}

async function renderStatsAsync() {
  const box = $("stats-summary");
  try {
    await ensureStatsModules();
  } catch (e) {
    console.warn("成績モジュールの読込に失敗:", e);
    if (box) {
      box.innerHTML =
        '<p class="reports-error">成績グラフの読込に失敗しました。再読み込みしてください。</p>';
    }
    return;
  }

  if (
    typeof QuizStorage !== "undefined" &&
    QuizStorage.subjectId &&
    typeof CURRENT_SUBJECT !== "undefined" &&
    CURRENT_SUBJECT &&
    CURRENT_SUBJECT.storageKey
  ) {
    try {
      const prevLocal = QuizStorage._loadLocalForSubject
        ? QuizStorage._loadLocalForSubject()
        : QuizStorage.stats;
      const full = await QuizStorage.loadStatsForSubject(
        QuizStorage.subjectId,
        CURRENT_SUBJECT.storageKey
      );
      if (full) {
        const merged =
          typeof QuizStorage._mergeStatsPair === "function"
            ? QuizStorage._mergeStatsPair(prevLocal, full)
            : full;
        const thinVsPrev =
          typeof QuizStorage._detailIsThinner === "function" &&
          QuizStorage._detailIsThinner(merged, prevLocal);
        const thinVsFull =
          typeof QuizStorage._detailIsThinner === "function" &&
          QuizStorage._detailIsThinner(merged, full);
        if (thinVsPrev && prevLocal) {
          QuizStorage.stats = QuizStorage._mergeStatsPair(prevLocal, merged);
        } else if (thinVsFull) {
          QuizStorage.stats = QuizStorage._mergeStatsPair(full, merged);
        } else {
          QuizStorage.stats = merged;
        }
        if (typeof QuizStorage._restoreCountersFromQ === "function") {
          QuizStorage.stats = QuizStorage._restoreCountersFromQ(QuizStorage.stats);
        }
        if (typeof QuizStorage._recoverThinStats === "function") {
          QuizStorage.stats = QuizStorage._recoverThinStats(
            QuizStorage.stats,
            QuizStorage.subjectId
          );
        }
        QuizStorage._writeLocal();
        // 未同期のときだけ送る（毎回の巨大 detail 再送を避ける）
        if (
          QuizStorage._ensureCloudAuth &&
          QuizStorage._ensureCloudAuth() &&
          QuizStorage._isPendingFor &&
          QuizStorage._isPendingFor(QuizStorage.uid)
        ) {
          await QuizStorage.flushPendingCloudSave();
        }
      }
    } catch (e) {
      console.warn("成績詳細の再読込に失敗:", e);
    }
  }

  if (
    typeof QuizStorage.reconcileForSubject === "function" &&
    typeof QUIZ_DATA !== "undefined" &&
    QUIZ_DATA.length > 0
  ) {
    const choiceIds = new Set(QUIZ_DATA.map((q) => q.id));
    const inputIds = new Set(
      QUIZ_DATA.filter((q) => INPUT_CATEGORIES.has(q.category)).map((q) => q.id)
    );
    if (QuizStorage.reconcileForSubject(choiceIds, inputIds)) {
      if (typeof QuizStorage.persistIfDirty === "function") {
        await QuizStorage.persistIfDirty();
      }
    }
  }

  const stats = renderRankBanner("stats");
  if (!stats.q || typeof stats.q !== "object") stats.q = {};

  const answered =
    typeof effectiveAnsweredCount === "function"
      ? effectiveAnsweredCount(stats)
      : Number(stats.answered) || 0;
  const correct =
    typeof effectiveCorrectCount === "function" ? effectiveCorrectCount(stats) : Number(stats.correct) || 0;
  const allTime = choiceAccuracyAllTime(stats);
  const recent = choiceAccuracyRecent(stats);
  const recentInput = inputAccuracyRecent(stats);
  const accInputAll = accuracy(stats.inputCorrect || 0, stats.inputAnswered || 0);
  const choiceTried = choiceAttemptedCount(stats);
  const inputTried = inputAttemptedCount(stats);
  const choiceM =
    typeof masteredCount === "function" ? masteredCount(stats) : choiceMasteredCount(stats);
  const inputM = inputMasteredCount(stats);
  const tcodeN = tcodeQuestionCount();
  const choiceMPct = QUIZ_DATA.length === 0 ? 0 : Math.round((choiceM / QUIZ_DATA.length) * 100);
  const inputMPct = tcodeN === 0 ? 0 : Math.round((inputM / tcodeN) * 100);
  const qSize = Object.keys(stats.q || {}).length;
  const detailThin = answered >= 50 && qSize < Math.max(10, Math.floor(answered * 0.02));
  const recentLabel = recent.fromLog
    ? `選択式直近正答率（${recent.sample}/${recent.windowSize}問）`
    : `選択式直近正答率（計測開始前→全期間）`;
  const recentInputLabel = recentInput.fromLog
    ? `記述式直近正答率（${recentInput.sample}/${recentInput.windowSize}問）`
    : `記述式直近正答率（計測開始前→全期間）`;

  const usesInput =
    typeof subjectUsesInput === "function" ? subjectUsesInput() : tcodeN > 0;
  const showInputStats = usesInput && tcodeN > 0;

  let html =
    `<div class="stat-box"><div class="sb-value">${answered}</div><div class="sb-label">累計回答数</div></div>` +
    `<div class="stat-box"><div class="sb-value">${correct}</div><div class="sb-label">累計正解数</div></div>` +
    `<div class="stat-box"><div class="sb-value">${choiceTried} / ${QUIZ_DATA.length}</div><div class="sb-label">選択式挑戦済み問題数</div></div>` +
    `<div class="stat-box"><div class="sb-value">${allTime.pct}%</div><div class="sb-label">選択式正答率（全期間）</div></div>` +
    `<div class="stat-box"><div class="sb-value">${recent.pct}%</div><div class="sb-label">${escapeHtml(recentLabel)}</div></div>`;
  if (showInputStats) {
    html +=
      `<div class="stat-box"><div class="sb-value">${inputTried} / ${tcodeN}</div><div class="sb-label">記述式挑戦済み問題数</div></div>` +
      `<div class="stat-box"><div class="sb-value">${recentInput.pct}%</div><div class="sb-label">${escapeHtml(recentInputLabel)}</div></div>` +
      `<div class="stat-box"><div class="sb-value">${accInputAll}%</div><div class="sb-label">記述式正答率（全期間）</div></div>`;
  }
  html +=
    `<div class="stat-box"><div class="sb-value">${choiceM} / ${QUIZ_DATA.length}</div><div class="sb-label">選択式習得（段位判定・2回連続正解）<span class="mastery-pct-secondary"> · ${choiceMPct}%</span></div></div>`;
  if (showInputStats) {
    html +=
      `<div class="stat-box"><div class="sb-value">${inputM} / ${tcodeN}</div><div class="sb-label">記述式習得（Tコード・2回連続正解）<span class="mastery-pct-secondary"> · ${inputMPct}%</span></div></div>`;
  }

  if (
    typeof MasteryDisplay !== "undefined" &&
    typeof CURRENT_SUBJECT !== "undefined" &&
    CURRENT_SUBJECT &&
    CURRENT_SUBJECT.id
  ) {
    const hasProg = choiceM > 0 || answered > 0;
    const note = MasteryDisplay.denomGrowthNote(
      CURRENT_SUBJECT.id,
      QUIZ_DATA.length,
      hasProg
    );
    if (note) {
      html +=
        `<p class="setting-hint mastery-denom-note" style="grid-column:1/-1;margin:8px 0 0">${escapeHtml(note)}</p>`;
    }
  }

  if (detailThin) {
    html +=
      `<p class="setting-hint" style="grid-column:1/-1;margin:8px 0 0">` +
      `問題別の詳細データが不足しているため、カテゴリ別などの内訳は不完全です。` +
      `SAP道場と同じアカウントで取り込めば復元できる場合があります。` +
      `</p>`;
  }
  if (box) box.innerHTML = html;

  try {
    StatsAnalysis.renderRecentAccuracyTrend($("stats-acc-trend"), stats);
    const inputTrend = $("stats-input-acc-trend");
    if (inputTrend) {
      if (showInputStats) {
        inputTrend.classList.remove("hidden");
        StatsAnalysis.renderInputAccuracyTrend(inputTrend, stats);
      } else {
        inputTrend.innerHTML = "";
        inputTrend.classList.add("hidden");
      }
    }
    StatsAnalysis.renderCategoryAccuracy($("stats-by-category"), stats, allTime.pct);
    StatsAnalysis.renderPriorityStats($("stats-by-priority"), stats);
    StatsAnalysis.renderModuleAccuracy($("stats-by-module"), stats, allTime.pct);
    const reviewTop = StatsAnalysis.getReviewPriorities(stats, StatsAnalysis.REVIEW_TOP);
    StatsAnalysis.renderReviewTop($("stats-review-top"), reviewTop);
    $("stats-review-quiz-btn").classList.toggle("hidden", reviewTop.length === 0);
  } catch (e) {
    console.warn("成績グラフ描画に失敗:", e);
  }

  if (typeof ActivityCalendar !== "undefined") {
    ActivityCalendar.render($("stats-activity-cal"), stats.daily || {});
  }
}

/** 復習リストの全問で復習クイズを開始する（成績画面のボタンから） */
function startReviewQuiz() {
  const usesInput =
    typeof subjectUsesInput === "function" ? subjectUsesInput() : true;
  const usesDirection =
    typeof subjectUsesDirection === "function" ? subjectUsesDirection() : true;
  startQuiz({
    categories: Object.keys(CATEGORIES),
    modules: "all",
    priorities: [1, 2, 3],
    direction: usesDirection ? "mixed" : "name2code",
    count: "all",
    answerMode: usesInput ? $("answer-mode-select").value : "choice",
    poolMode: "wrong",
  });
}
