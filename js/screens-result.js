/** 結果画面・XP / 習得ゲージ */

// ===== 結果画面 =====
function renderResult() {
  const total = quiz.questions.length;
  const acc = accuracy(quiz.correctCount, total);
  $("result-percent").textContent = acc + "%";
  $("result-fraction").textContent = `${quiz.correctCount} / ${total} 問正解`;

  let message;
  if (acc === 100) message = "全問正解！素晴らしい！";
  else if (acc >= 80) message = "よくできました！この調子で繰り返しましょう。";
  else if (acc >= 60) message = "あと少し。間違えた問題を復習しましょう。";
  else message = "繰り返し解いて定着させましょう。";
  $("result-message").textContent = message;

  // 昇段／降段の判定
  const rankAfter = getRank(QuizStorage.load());
  const banner = $("rank-up-banner");
  if (rankAfter.name !== quiz.rankBefore) {
    const beforeIdx = RANKS.findIndex((r) => r.name === quiz.rankBefore);
    const afterIdx = RANKS.indexOf(rankAfter);
    const promoted = afterIdx > beforeIdx;
    banner.textContent = promoted
      ? `昇段しました！ ${quiz.rankBefore} → ${rankAfter.name}「${rankAfter.alias}」`
      : `降段しました ${quiz.rankBefore} → ${rankAfter.name}「${rankAfter.alias}」`;
    banner.classList.toggle("rank-down", !promoted);
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
    banner.classList.remove("rank-down");
  }

  // 経験値ゲージ（クイズ前→クイズ後の進捗をアニメーション表示）
  animateXpGauge(quiz.statsBefore, QuizStorage.load());
  animateMasteredGauge(quiz.statsBefore, QuizStorage.load());

  // 記述式習得は記述式／両方出題のときだけ表示
  const showInputMastery =
    quiz.settings &&
    (quiz.settings.answerMode === "input" || quiz.settings.answerMode === "both");
  const inputMasteredArea = $("input-mastered-area");
  if (inputMasteredArea) {
    inputMasteredArea.classList.toggle("hidden", !showInputMastery);
    if (showInputMastery) {
      animateInputMasteredGauge(quiz.statsBefore, QuizStorage.load());
    }
  }

  // 間違えた問題の一覧
  const wrongCard = $("wrong-list-card");
  const wrongBadge = $("wrong-count-badge");
  const list = $("wrong-list");
  list.innerHTML = "";
  if (quiz.wrongs.length === 0) {
    wrongCard.classList.add("hidden");
  } else {
    wrongCard.classList.remove("hidden");
    wrongBadge.textContent = `${quiz.wrongs.length}問`;
    wrongBadge.classList.remove("hidden");
    quiz.wrongs.forEach(({ q, given }, i) => {
      list.insertAdjacentHTML("beforeend", buildWrongItemHtml(q, given, i + 1));
    });
  }
}

// ===== 結果画面の経験値ゲージ =====
function setXpBadge(rank) {
  const badge = $("xp-badge");
  badge.textContent = rank.name;
  badge.style.background = rank.color;
  badge.style.color = rank.fg;
}

/** 結果画面の経験値下に、次段の昇段条件を描画（達成済みも出す。モバイルでは条件ごとに改行） */
function renderXpConditions(el, progress) {
  if (!progress.next) {
    el.textContent = progress.summary || progress.headline || "";
    return;
  }
  const rows = progress.conditions || [];
  if (rows.length === 0) {
    el.textContent = progress.headline || "";
    return;
  }
  el.innerHTML = rows
    .map((c, i) => {
      const sep = i === 0 ? "" : `<span class="xp-cond-sep"> · </span>`;
      const mark = c.met ? "✓ " : "";
      const cls = c.met ? "xp-cond is-met" : "xp-cond";
      return (
        sep +
        `<span class="${cls}">${escapeHtml(c.label)} ${mark}${escapeHtml(c.detail)}</span>`
      );
    })
    .join("");
}

/**
 * クイズ前→クイズ後の段位進捗をゲージのアニメーションで見せる。
 * 昇段をまたいだ場合は「満タン→バッジが次の段位に切り替わってゲージが0から再スタート」
 * を段位の数だけ繰り返す（ポケモンのレベルアップ演出のイメージ）。
 */
function animateXpGauge(statsBefore, statsAfter) {
  const before = rankProgress(statsBefore);
  const after = rankProgress(statsAfter);
  const fill = $("xp-fill");
  const badge = $("xp-badge");

  setXpBadge(before.rank);
  $("xp-label").textContent = before.next ? `次の段位「${before.next.name}」への経験値` : "経験値";
  $("xp-text").textContent = "";

  // アニメーションなしでクイズ前の進捗に置いてから動かし始める
  fill.style.transition = "none";
  fill.style.width = before.pct + "%";
  void fill.offsetWidth;

  const beforeIdx = RANKS.indexOf(before.rank);
  const afterIdx = RANKS.indexOf(after.rank);

  let delay = 500;
  const schedule = (fn, holdMs) => { setTimeout(fn, delay); delay += holdMs; };

  // 昇段1回ごとに「満タン→切り替え→0から」を繰り返す
  for (let i = beforeIdx; i < afterIdx; i++) {
    const newRank = RANKS[i + 1];
    const rankAfterNew = RANKS[i + 2];
    schedule(() => {
      fill.style.transition = "width 0.8s ease";
      fill.style.width = "100%";
    }, 900);
    schedule(() => {
      setXpBadge(newRank);
      badge.classList.add("xp-pop");
      setTimeout(() => badge.classList.remove("xp-pop"), 500);
      $("xp-label").textContent = rankAfterNew ? `次の段位「${rankAfterNew.name}」への経験値` : "最高位に到達！";
      fill.style.transition = "none";
      fill.style.width = "0%";
      void fill.offsetWidth;
    }, 350);
  }

  // 最終進捗まで伸ばす（正答率低下で降段した稀なケースはバッジを直接合わせる）
  schedule(() => {
    if (afterIdx < beforeIdx) {
      setXpBadge(after.rank);
      $("xp-label").textContent = after.next ? `次の段位「${after.next.name}」への経験値` : "経験値";
    }
    fill.style.transition = "width 0.8s ease";
    fill.style.width = after.pct + "%";
    renderXpConditions($("xp-text"), after);
  }, 0);
}

function masteredChipLabel(e) {
  if (!e) return "";
  const code = String(e.code || "").trim();
  const name = String(e.name || e.question || "").trim();
  if (e.category === "tcode") return code || name || e.id || "";
  if (code && code.length <= 28) return code;
  if (name) return name.length > 40 ? name.slice(0, 40) + "…" : name;
  return code || e.id || "";
}

/** 今回新習得チップ用の entry 一覧（セッション記録を優先、なければ統計差分） */
function newlyMasteredEntries(sessionMap, beforeSet, afterSet) {
  if (sessionMap && sessionMap.size > 0) {
    return [...sessionMap.values()];
  }
  return [...afterSet]
    .filter((id) => !beforeSet.has(id))
    .map((id) => getQuizEntry(id))
    .filter(Boolean);
}

function renderMasteredNewList(newList, entries, label) {
  if (!newList) return;
  if (!entries.length) {
    newList.classList.add("hidden");
    newList.innerHTML = "";
    return;
  }
  const chips = entries
    .map((e) => {
      const text = masteredChipLabel(e);
      const title = String(e.name || e.question || e.code || "").trim();
      const titleAttr = title && title !== text ? ` title="${escapeHtml(title)}"` : "";
      return `<span class="mastered-chip"${titleAttr}>${escapeHtml(text)}</span>`;
    })
    .join("");
  newList.innerHTML =
    `<div class="mastered-new-label">${escapeHtml(label)}</div>` +
    `<div class="mastered-chips">${chips}</div>`;
  newList.classList.remove("hidden");
}

/** クイズ前→クイズ後の習得済み数をゲージでアニメーション表示 */
function animateMasteredGauge(statsBefore, statsAfter) {
  const before = masteredCount(statsBefore);
  const after = masteredCount(statsAfter);
  const total = QUIZ_DATA.length;
  const fill = $("mastered-fill");
  const badge = $("mastered-badge");
  const text = $("mastered-text");
  const newList = $("mastered-new-list");

  const beforeSet = masteredIdSet(statsBefore);
  const afterSet = masteredIdSet(statsAfter);

  badge.textContent = before;
  text.textContent = `${before} / ${total}問（${masteredPct(before)}%）`;
  newList.classList.add("hidden");
  newList.innerHTML = "";

  fill.style.transition = "none";
  fill.style.width = masteredPct(before) + "%";
  void fill.offsetWidth;

  setTimeout(() => {
    fill.style.transition = "width 0.9s ease";
    fill.style.width = masteredPct(after) + "%";
    badge.textContent = after;

    const delta = after - before;
    let deltaNote = "";
    if (delta > 0) deltaNote = `　<span class="mastered-delta up">+${delta}</span>`;
    else if (delta < 0) deltaNote = `　<span class="mastered-delta down">${delta}</span>`;
    text.innerHTML = `${before} → ${after} / ${total}問（${masteredPct(after)}%）${deltaNote}`;

    const entries = newlyMasteredEntries(
      quiz.sessionNewChoiceMastered,
      beforeSet,
      afterSet
    );
    renderMasteredNewList(newList, entries, "今回新しく習得");
  }, 600);
}

/** クイズ前→クイズ後の記述式習得数をゲージでアニメーション表示 */
function animateInputMasteredGauge(statsBefore, statsAfter) {
  const beforeSet = inputMasteredIdSet(statsBefore);
  const afterSet = inputMasteredIdSet(statsAfter);
  const before = beforeSet.size;
  const after = afterSet.size;
  const total = tcodeQuestionCount();
  const fill = $("input-mastered-fill");
  const badge = $("input-mastered-badge");
  const text = $("input-mastered-text");
  const newList = $("input-mastered-new-list");
  if (!fill || !badge || !text || !newList) return;

  badge.textContent = before;
  text.textContent = `${before} / ${total}問（${inputMasteredPct(before)}%）`;
  newList.classList.add("hidden");
  newList.innerHTML = "";

  fill.style.transition = "none";
  fill.style.width = inputMasteredPct(before) + "%";
  void fill.offsetWidth;

  setTimeout(() => {
    fill.style.transition = "width 0.9s ease";
    fill.style.width = inputMasteredPct(after) + "%";
    badge.textContent = after;

    const delta = after - before;
    let deltaNote = "";
    if (delta > 0) deltaNote = `　<span class="mastered-delta up">+${delta}</span>`;
    else if (delta < 0) deltaNote = `　<span class="mastered-delta down">${delta}</span>`;
    text.innerHTML =
      `${before} → ${after} / ${total}問（${inputMasteredPct(after)}%）${deltaNote}`;

    const entries = newlyMasteredEntries(
      quiz.sessionNewInputMastered,
      beforeSet,
      afterSet
    );
    renderMasteredNewList(newList, entries, "今回新しく習得（記述式）");
  }, 600);
}
