/** 成績画面（アプリ側ラッパ） */

// ===== 成績画面 =====
function renderStats() {
  void renderStatsAsync();
}

async function renderStatsAsync() {
  try {
    await ensureStatsModules();
  } catch (e) {
    console.warn("成績モジュールの読込に失敗:", e);
    const box = $("stats-summary");
    if (box) {
      box.innerHTML =
        '<p class="reports-error">成績グラフの読込に失敗しました。再読み込みしてください。</p>';
    }
    return;
  }

  const stats = renderRankBanner("stats");
  const allTime = choiceAccuracyAllTime(stats);
  const recent = choiceAccuracyRecent(stats);
  const recentInput = inputAccuracyRecent(stats);
  const accInputAll = accuracy(stats.inputCorrect || 0, stats.inputAnswered || 0);
  const choiceTried = choiceAttemptedCount(stats);
  const inputTried = inputAttemptedCount(stats);
  const choiceM = choiceMasteredCount(stats);
  const inputM = inputMasteredCount(stats);
  const tcodeN = tcodeQuestionCount();
  const choiceMPct = QUIZ_DATA.length === 0 ? 0 : Math.round((choiceM / QUIZ_DATA.length) * 100);
  const inputMPct = tcodeN === 0 ? 0 : Math.round((inputM / tcodeN) * 100);
  const recentLabel = recent.fromLog
    ? `選択式直近正答率（${recent.sample}/${recent.windowSize}問）`
    : `選択式直近正答率（計測開始前→全期間）`;
  const recentInputLabel = recentInput.fromLog
    ? `記述式直近正答率（${recentInput.sample}/${recentInput.windowSize}問）`
    : `記述式直近正答率（計測開始前→全期間）`;
  $("stats-summary").innerHTML =
    `<div class="stat-box"><div class="sb-value">${stats.answered}</div><div class="sb-label">累計回答数</div></div>` +
    `<div class="stat-box"><div class="sb-value">${stats.correct}</div><div class="sb-label">累計正解数</div></div>` +
    `<div class="stat-box"><div class="sb-value">${choiceTried} / ${QUIZ_DATA.length}</div><div class="sb-label">選択式挑戦済み問題数</div></div>` +
    `<div class="stat-box"><div class="sb-value">${allTime.pct}%</div><div class="sb-label">選択式正答率（全期間）</div></div>` +
    `<div class="stat-box"><div class="sb-value">${recent.pct}%</div><div class="sb-label">${escapeHtml(recentLabel)}</div></div>` +
    `<div class="stat-box"><div class="sb-value">${inputTried} / ${tcodeN}</div><div class="sb-label">記述式挑戦済み問題数</div></div>` +
    `<div class="stat-box"><div class="sb-value">${recentInput.pct}%</div><div class="sb-label">${escapeHtml(recentInputLabel)}</div></div>` +
    `<div class="stat-box"><div class="sb-value">${accInputAll}%</div><div class="sb-label">記述式正答率（全期間）</div></div>` +
    `<div class="stat-box"><div class="sb-value">${choiceM} / ${QUIZ_DATA.length}</div><div class="sb-label">選択式習得 ${choiceMPct}%（段位判定・2回連続正解）</div></div>` +
    `<div class="stat-box"><div class="sb-value">${inputM} / ${tcodeN}</div><div class="sb-label">記述式習得 ${inputMPct}%（Tコード・2回連続正解）</div></div>`;

  StatsAnalysis.renderRecentAccuracyTrend($("stats-acc-trend"), stats);
  StatsAnalysis.renderInputAccuracyTrend($("stats-input-acc-trend"), stats);

  // カテゴリ別の正答率（正答率の低い順）— 棒の全体比較は全期間の選択式を基準
  StatsAnalysis.renderCategoryAccuracy($("stats-by-category"), stats, allTime.pct);

  StatsAnalysis.renderPriorityStats($("stats-by-priority"), stats);
  StatsAnalysis.renderModuleAccuracy($("stats-by-module"), stats, allTime.pct);

  const reviewTop = StatsAnalysis.getReviewPriorities(stats, StatsAnalysis.REVIEW_TOP);
  StatsAnalysis.renderReviewTop($("stats-review-top"), reviewTop);
  $("stats-review-quiz-btn").classList.toggle("hidden", reviewTop.length === 0);

  if (typeof ActivityCalendar !== "undefined") {
    ActivityCalendar.render($("stats-activity-cal"), stats.daily || {});
  }
}

/** 復習リストの全問で復習クイズを開始する（成績画面のボタンから） */
function startReviewQuiz() {
  startQuiz({
    categories: Object.keys(CATEGORIES),
    modules: "all",
    priorities: [1, 2, 3],
    direction: "mixed",
    count: "all",
    answerMode: $("answer-mode-select").value,
    poolMode: "wrong",
  });
}
