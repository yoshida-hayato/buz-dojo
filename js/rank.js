/** 段位判定・正答率・習得カウント */

function resolveRanksForSubject(subject) {
  let ranks =
    Array.isArray(subject.ranks) && subject.ranks.length
      ? subject.ranks.slice()
      : DEFAULT_RANKS.slice();
  const hasInput = subject.inputCategories && subject.inputCategories.length > 0;
  if (!hasInput) {
    ranks = ranks.map((r) => {
      const copy = Object.assign({}, r);
      delete copy.inputCorrectRatio;
      delete copy.minInputAcc;
      delete copy.minInputMasteredPct;
      return copy;
    });
  }
  return ranks;
}

function masteredCountForIds(stats, validIds) {
  if (!stats) return 0;
  if (typeof stats.masteredChoice === "number") {
    return stats.masteredChoice;
  }
  if (!stats.q) return 0;
  let n = 0;
  for (const [id, s] of Object.entries(stats.q)) {
    if ((!validIds || validIds.has(id)) && QuizStorage.isChoiceMastered(s)) n += 1;
  }
  return n;
}

function inputMasteredCountForIds(stats, validIds) {
  if (!stats) return 0;
  if (typeof stats.masteredInput === "number") {
    return stats.masteredInput;
  }
  if (!stats.q || !validIds || validIds.size === 0) return 0;
  let n = 0;
  for (const [id, s] of Object.entries(stats.q)) {
    if (validIds.has(id) && (s.ik || 0) >= 2) n += 1;
  }
  return n;
}

function createRankContext(summary) {
  const total = summary.questionTotal;
  const validIds = summary.validQuestionIds;
  const inputIds = summary.inputQuestionIds || new Set();
  const inputTotal = inputIds.size;
  const ranks = resolveRanksForSubject(summary.subject);
  const cap = total * RANK_CORRECT_CAP_MULT;
  return {
    total,
    ranks,
    masteredNeeded(pct) {
      return Math.ceil(((pct || 0) / 100) * total);
    },
    rankMinCorrect(r) {
      return Math.floor(cap * (r.correctRatio || 0));
    },
    rankMinInputCorrect(r) {
      if (!r.inputCorrectRatio) return 0;
      return Math.ceil(total * r.inputCorrectRatio);
    },
    inputMasteredNeeded(pct) {
      return Math.ceil(((pct || 0) / 100) * inputTotal);
    },
    masteredCount(stats) {
      return masteredCountForIds(stats, validIds);
    },
    inputMasteredCount(stats) {
      return inputMasteredCountForIds(stats, inputIds);
    },
  };
}

function createRankContextFromLoaded() {
  const validIds = new Set(QUIZ_DATA.map((q) => q.id));
  const inputIds = new Set(
    QUIZ_DATA.filter((q) => INPUT_CATEGORIES.has(q.category)).map((q) => q.id)
  );
  const cap = rankCorrectCap();
  return {
    total: QUIZ_DATA.length,
    ranks: RANKS,
    masteredNeeded(pct) {
      return Math.ceil(((pct || 0) / 100) * QUIZ_DATA.length);
    },
    rankMinCorrect(r) {
      return Math.floor(cap * (r.correctRatio || 0));
    },
    rankMinInputCorrect(r) {
      if (!r.inputCorrectRatio) return 0;
      return Math.ceil(QUIZ_DATA.length * r.inputCorrectRatio);
    },
    inputMasteredNeeded(pct) {
      return Math.ceil(((pct || 0) / 100) * inputIds.size);
    },
    masteredCount(stats) {
      return masteredCountForIds(stats, validIds);
    },
    inputMasteredCount(stats) {
      return inputMasteredCountForIds(stats, inputIds);
    },
  };
}

/**
 * 科目ピッカー用。catalog 件数＋サマリ（answered/correct/mastered）から段位を再計算する。
 * 保存済み rankName に依存しない（修復後の空／古いスナップショットズレを防ぐ）。
 * 入力問題集合は持たないため入力条件は外す（選択式の累計・習得・正答率のみ）。
 */
function createPickerRankContext(catalogTotal, subjectId) {
  const total = Math.max(0, Number(catalogTotal) || 0);
  const baseRanks =
    subjectId === "sap" && typeof DEFAULT_SAP_RANKS !== "undefined"
      ? DEFAULT_SAP_RANKS
      : typeof DEFAULT_RANKS !== "undefined"
        ? DEFAULT_RANKS
        : [];
  const ranks = resolveRanksForSubject({
    ranks: baseRanks,
    inputCategories: [],
  });
  const cap = total * (typeof RANK_CORRECT_CAP_MULT === "number" ? RANK_CORRECT_CAP_MULT : 3);
  return {
    total,
    ranks,
    masteredNeeded(pct) {
      return Math.ceil(((pct || 0) / 100) * total);
    },
    rankMinCorrect(r) {
      return Math.floor(cap * (r.correctRatio || 0));
    },
    rankMinInputCorrect() {
      return 0;
    },
    inputMasteredNeeded() {
      return 0;
    },
    masteredCount(stats) {
      return Number(stats && stats.masteredChoice) || 0;
    },
    inputMasteredCount(stats) {
      return Number(stats && stats.masteredInput) || 0;
    },
  };
}

/** 科目選択カード用。SAPの getRank と同条件（minInputMasteredPct + inputCorrectRatio 両対応） */
function getRankForContext(stats, ctx) {
  const acc = rankChoiceAccuracyPct(stats);
  const accInput = rankInputAccuracyPct(stats);
  const mastered = ctx.masteredCount(stats);
  const inputMastered = ctx.inputMasteredCount ? ctx.inputMasteredCount(stats) : 0;
  let current = ctx.ranks[0];
  for (const r of ctx.ranks) {
    if (
      stats.correct >= ctx.rankMinCorrect(r) &&
      acc >= (r.minAcc || 0) &&
      mastered >= ctx.masteredNeeded(r.minMasteredPct || 0) &&
      inputMastered >= ctx.inputMasteredNeeded(r.minInputMasteredPct || 0) &&
      (stats.inputCorrect || 0) >= ctx.rankMinInputCorrect(r) &&
      accInput >= (r.minInputAcc || 0)
    ) {
      current = r;
    }
  }
  return current;
}

function accuracy(correct, answered) {
  return answered === 0 ? 0 : Math.round((correct / answered) * 100);
}

/** 選択式の全期間正答率（記述式を除く） */
function choiceAccuracyAllTime(stats) {
  const answered = Math.max(0, (stats.answered || 0) - (stats.inputAnswered || 0));
  const correct = Math.max(0, (stats.correct || 0) - (stats.inputCorrect || 0));
  return { correct, answered, pct: accuracy(correct, answered) };
}

/**
 * 選択式の直近正答率。窓幅＝RECENT_ACCURACY_WINDOW（500問）。
 * choiceLog がまだ無い移行前データは全期間の選択式正答率で代替する。
 */
function choiceAccuracyRecent(stats) {
  const windowSize = typeof RECENT_ACCURACY_WINDOW === "number" ? RECENT_ACCURACY_WINDOW : 500;
  const log = Array.isArray(stats.choiceLog) ? stats.choiceLog : [];
  if (log.length === 0) {
    const all = choiceAccuracyAllTime(stats);
    return { ...all, windowSize, sample: all.answered, fromLog: false };
  }
  const recent = log.slice(-windowSize);
  const answered = recent.length;
  const correct = recent.reduce((sum, v) => sum + (v ? 1 : 0), 0);
  return {
    correct,
    answered,
    pct: accuracy(correct, answered),
    windowSize,
    sample: answered,
    fromLog: true,
  };
}

/**
 * 記述式の直近正答率。窓幅＝RECENT_INPUT_ACCURACY_WINDOW（100問）。
 * inputLog がまだ無い移行前データは全期間の記述式正答率で代替する。
 */
function inputAccuracyRecent(stats) {
  const windowSize =
    typeof RECENT_INPUT_ACCURACY_WINDOW === "number" ? RECENT_INPUT_ACCURACY_WINDOW : 100;
  const log = Array.isArray(stats.inputLog) ? stats.inputLog : [];
  if (log.length === 0) {
    const answered = stats.inputAnswered || 0;
    const correct = stats.inputCorrect || 0;
    return {
      correct,
      answered,
      pct: accuracy(correct, answered),
      windowSize,
      sample: answered,
      fromLog: false,
    };
  }
  const recent = log.slice(-windowSize);
  const answered = recent.length;
  const correct = recent.reduce((sum, v) => sum + (v ? 1 : 0), 0);
  return {
    correct,
    answered,
    pct: accuracy(correct, answered),
    windowSize,
    sample: answered,
    fromLog: true,
  };
}

/** 段位判定・進捗用の選択式正答率（直近窓。ログ無し時は全期間） */
function rankChoiceAccuracyPct(stats) {
  return choiceAccuracyRecent(stats).pct;
}

/** 段位判定・進捗用の記述式正答率（直近100問。ログ無し時は全期間） */
function rankInputAccuracyPct(stats) {
  return inputAccuracyRecent(stats).pct;
}

/** 現存問題のうち、選択式で1回以上挑戦した問題数 */
function choiceAttemptedCount(stats) {
  const valid = new Set(QUIZ_DATA.map((q) => q.id));
  let matched = 0;
  let any = 0;
  for (const [id, s] of Object.entries(stats.q || {})) {
    const choiceA = Math.max(0, (s.a || 0) - (s.ia || 0));
    if (choiceA <= 0) continue;
    any += 1;
    if (valid.has(id)) matched += 1;
  }
  // 現行マスタと ID が一致しない旧詳細だけのときは件数を落とさない
  return matched > 0 ? matched : any;
}

/** 現存問題のうち、記述式で1回以上挑戦した問題数 */
function inputAttemptedCount(stats) {
  const valid = new Set(QUIZ_DATA.map((q) => q.id));
  let matched = 0;
  let any = 0;
  for (const [id, s] of Object.entries(stats.q || {})) {
    if ((s.ia || 0) <= 0) continue;
    any += 1;
    if (valid.has(id)) matched += 1;
  }
  return matched > 0 ? matched : any;
}

// ===== 段位 =====
/**
 * 選択式習得済み（2回連続正解中）の問題数。
 * 現存問題の q 集計を優先し、q が空のときだけ保存値を使う。
 */
function masteredCount(stats) {
  const fromQ = masteredIdSet(stats).size;
  const stored = typeof stats.masteredChoice === "number" ? stats.masteredChoice : 0;
  const qSize = stats.q ? Object.keys(stats.q).length : 0;
  if (qSize > 0) return fromQ;
  return stored || fromQ;
}

function choiceMasteredCount(stats) {
  return masteredCount(stats);
}

/** 累計正解。現存問題の q があればそれを優先（削除済み問題は含めない） */
function effectiveCorrectCount(stats) {
  const stored = Number(stats.correct) || 0;
  if (!stats.q || !Object.keys(stats.q).length) return stored;
  if (typeof QUIZ_DATA === "undefined" || !QUIZ_DATA.length) return stored;
  const valid = new Set(QUIZ_DATA.map((q) => q.id));
  let correct = 0;
  let hasSubjectRow = false;
  for (const [id, row] of Object.entries(stats.q)) {
    if (!valid.has(id)) continue;
    hasSubjectRow = true;
    correct += Number(row.c) || 0;
  }
  return hasSubjectRow ? correct : stored;
}

/** 累計回答（reconcile 済みのサマリを表示） */
function effectiveAnsweredCount(stats) {
  return Math.max(0, Number(stats.answered) || 0);
}

/** 選択式習得済み問題IDの集合（現存する問題のみ） */
function masteredIdSet(stats) {
  const valid = new Set(QUIZ_DATA.map((q) => q.id));
  const set = new Set();
  if (!stats.q) return set;
  for (const [id, s] of Object.entries(stats.q)) {
    if (valid.has(id) && QuizStorage.isChoiceMastered(s)) set.add(id);
  }
  return set;
}

/** 記述式習得済み問題IDの集合（inputCategories に属する現存問題のみ） */
function inputMasteredIdSet(stats) {
  const valid = new Set(
    QUIZ_DATA.filter((q) => INPUT_CATEGORIES.has(q.category)).map((q) => q.id)
  );
  const set = new Set();
  if (!stats.q) return set;
  for (const [id, s] of Object.entries(stats.q)) {
    if (valid.has(id) && (s.ik || 0) >= 2) set.add(id);
  }
  return set;
}

function masteredPct(count) {
  return QUIZ_DATA.length === 0 ? 0 : Math.round((count / QUIZ_DATA.length) * 100);
}

function inputMasteredPct(count) {
  const total = tcodeQuestionCount();
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

/** 割合（%）を現在の総問題数に換算した必要習得数 */
function masteredNeeded(pct) {
  return Math.ceil(((pct || 0) / 100) * QUIZ_DATA.length);
}

/** 割合（%）を現在のTコード問題数に換算した記述式必要習得数 */
function inputMasteredNeeded(pct) {
  return Math.ceil(((pct || 0) / 100) * tcodeQuestionCount());
}

/** 累計正解の最高目標（名人）＝ 全問題数 × 3周分 */
function rankCorrectCap() {
  return QUIZ_DATA.length * RANK_CORRECT_CAP_MULT;
}

/** 段位定義から累計正解の必要数を算出する */
function rankMinCorrect(rankDef) {
  return Math.floor(rankCorrectCap() * (rankDef.correctRatio || 0));
}

function getRank(stats) {
  const acc = rankChoiceAccuracyPct(stats);
  const accInput = rankInputAccuracyPct(stats);
  const correct = effectiveCorrectCount(stats);
  const mastered = masteredCount(stats);
  const inputMastered =
    typeof stats.masteredInput === "number" && (!stats.q || !Object.keys(stats.q).length)
      ? stats.masteredInput
      : inputMasteredIdSet(stats).size;
  let current = RANKS[0];
  for (const r of RANKS) {
    if (
      correct >= rankMinCorrect(r) &&
      acc >= r.minAcc &&
      mastered >= masteredNeeded(r.minMasteredPct) &&
      inputMastered >= inputMasteredNeeded(r.minInputMasteredPct) &&
      accInput >= (r.minInputAcc || 0)
    ) current = r;
  }
  return current;
}

function getNextRank(stats) {
  const current = getRank(stats);
  const idx = RANKS.indexOf(current);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

/** 次の段位に向けた進捗（%）と表示用データを計算する（バナーと結果画面のゲージで共用） */
function rankProgress(stats) {
  const rank = getRank(stats);
  const next = getNextRank(stats);
  const recent = choiceAccuracyRecent(stats);
  const recentInput = inputAccuracyRecent(stats);
  const acc = recent.pct;
  const accInput = recentInput.pct;
  const correct = effectiveCorrectCount(stats);
  const mastered = masteredCount(stats);

  if (!next) {
    return { rank, next: null, pct: 100, headline: "最高位に到達！", conditions: [], summary: "最高位に到達！" };
  }

  const pcts = [];
  const conditions = [];

  const rankMin = rankMinCorrect(rank);
  const nextMin = rankMinCorrect(next);
  const inputMastered = inputMasteredIdSet(stats).size;

  // 表示順: 累計正解 → 選択式習得 → 選択式直近正答率 → 記述式習得 → 記述式直近正答率
  if (nextMin > rankMin) {
    const span = nextMin - rankMin;
    const done = Math.min(span, Math.max(0, correct - rankMin));
    pcts.push(span === 0 ? 100 : Math.round((done / span) * 100));
  }
  if (nextMin > 0) {
    const remain = Math.max(0, nextMin - correct);
    const met = correct >= nextMin;
    conditions.push({
      label: "累計正解",
      detail: met ? `${correct}/${nextMin}問` : `あと${remain}問`,
      met,
    });
  }

  if (next.minMasteredPct > (rank.minMasteredPct || 0)) {
    const need = masteredNeeded(next.minMasteredPct);
    const base = masteredNeeded(rank.minMasteredPct || 0);
    const span = need - base;
    const done = Math.min(span, Math.max(0, mastered - base));
    pcts.push(span === 0 ? 100 : Math.round((done / span) * 100));
  }
  if (next.minMasteredPct > 0) {
    const need = masteredNeeded(next.minMasteredPct);
    const remain = Math.max(0, need - mastered);
    const met = mastered >= need;
    conditions.push({
      label: "選択式習得",
      detail: met ? `${mastered}/${need}問` : `あと${remain}問`,
      met,
    });
  }

  if (next.minAcc > (rank.minAcc || 0)) {
    pcts.push(Math.min(100, Math.round((acc / next.minAcc) * 100)));
  }
  if (next.minAcc > 0) {
    conditions.push({
      label: "選択式直近正答率",
      detail: `${acc}/${next.minAcc}%`,
      met: acc >= next.minAcc,
    });
  }

  if ((next.minInputMasteredPct || 0) > (rank.minInputMasteredPct || 0)) {
    const need = inputMasteredNeeded(next.minInputMasteredPct);
    const base = inputMasteredNeeded(rank.minInputMasteredPct || 0);
    const span = need - base;
    const done = Math.min(span, Math.max(0, inputMastered - base));
    pcts.push(span === 0 ? 100 : Math.round((done / span) * 100));
  }
  if ((next.minInputMasteredPct || 0) > 0) {
    const need = inputMasteredNeeded(next.minInputMasteredPct);
    const remain = Math.max(0, need - inputMastered);
    const met = inputMastered >= need;
    conditions.push({
      label: "記述式習得",
      detail: met ? `${inputMastered}/${need}問` : `あと${remain}問`,
      met,
    });
  }

  if (next.minInputAcc > (rank.minInputAcc || 0)) {
    pcts.push(Math.min(100, Math.round((accInput / next.minInputAcc) * 100)));
  }
  if (next.minInputAcc > 0) {
    conditions.push({
      label: "記述式直近正答率",
      detail: `${accInput}/${next.minInputAcc}%`,
      met: accInput >= next.minInputAcc,
    });
  }

  const pct = pcts.length ? Math.min(...pcts) : 100;
  const headline = `次の「${next.name}」へ`;
  const pending = conditions.filter((c) => !c.met);
  const summary = pending.length
    ? pending.map((c) => `${c.label} ${c.detail}`).join(" · ")
    : headline;

  return { rank, next, pct, headline, conditions, summary };
}

/** 段位バナーの昇段条件を行単位で描画する */
function renderRankProgress(el, p) {
  if (!p.next) {
    el.innerHTML = `<div class="rank-headline">${escapeHtml(p.headline)}</div>`;
    return;
  }
  const rows = p.conditions
    .map(
      (c) =>
        `<div class="rank-cond${c.met ? " met" : ""}">` +
        `<span class="rank-cond-label">${escapeHtml(c.label)}</span>` +
        `<span class="rank-cond-detail">${c.met ? "✓ " : ""}${escapeHtml(c.detail)}</span>` +
        `</div>`
    )
    .join("");
  el.innerHTML =
    `<div class="rank-headline">${escapeHtml(p.headline)}</div>` +
    `<div class="rank-conds">${rows}</div>`;
}

function renderRankBanner(prefix) {
  const stats = QuizStorage.load();
  const p = rankProgress(stats);
  const badge = $(prefix + "-rank-badge");
  badge.textContent = p.rank.name;
  badge.style.background = p.rank.color;
  badge.style.color = p.rank.fg;
  $(prefix + "-rank-alias").textContent = p.rank.alias;
  renderRankProgress($(prefix + "-rank-progress"), p);
  $(prefix + "-rank-bar").style.width = p.pct + "%";
  return stats;
}

function inputMasteredCount(stats) {
  const fromQ = inputMasteredIdSet(stats).size;
  const stored = typeof stats.masteredInput === "number" ? stats.masteredInput : 0;
  if (stored > 0 && fromQ === 0) return stored;
  return Math.max(fromQ, stored);
}

function tcodeQuestionCount() {
  return QUIZ_DATA.filter((q) => INPUT_CATEGORIES.has(q.category)).length;
}
