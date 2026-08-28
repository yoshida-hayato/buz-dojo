/** クイズ進行・回答処理 */

// ===== クイズ進行 =====
function startQuiz(settings, options = {}) {
  void startQuizAsync(settings, options);
}

async function startQuizAsync(settings, options = {}) {
  try {
    await Promise.all([ensureQuestionStats(), ensureQuestionReports()]);
  } catch (e) {
    console.warn("クイズ補助スクリプトの読込に失敗:", e);
  }

  if (CURRENT_SUBJECT && typeof Entitlement !== "undefined") {
    const gate = Entitlement.canStart(CURRENT_SUBJECT.id, settings.count);
    if (!gate.ok) {
      alert(
        `本日の無料枠（${Entitlement.FREE_DAILY}問）を使い切りました。問題集を購入すると続きを学習できます。`
      );
      return;
    }
    if (gate.cappedTo != null && Number.isFinite(gate.remaining)) {
      settings = Object.assign({}, settings, { count: gate.cappedTo });
    }
  }

  const pool = buildPool(settings);
  if (pool.length === 0) return;

  let slots = orderPoolAvoidingRecent(pool, options.avoidIds);
  if (settings.count !== "all") slots = slots.slice(0, Number(settings.count));

  const statsNow = QuizStorage.load();
  quiz = {
    questions: slots.map((slot) =>
      buildQuestion(slot.entry, settings, slot.forceInputMode)
    ),
    idx: 0,
    correctCount: 0,
    wrongs: [],
    settings,
    rankBefore: getRank(statsNow).name,
    // 経験値・習得ゲージ用: クイズ開始時点の成績スナップショット（q で前後比較する）
    statsBefore: {
      answered: statsNow.answered,
      correct: statsNow.correct,
      inputAnswered: statsNow.inputAnswered || 0,
      inputCorrect: statsNow.inputCorrect || 0,
      choiceLog: Array.isArray(statsNow.choiceLog) ? statsNow.choiceLog.slice() : [],
      inputLog: Array.isArray(statsNow.inputLog) ? statsNow.inputLog.slice() : [],
      q: JSON.parse(JSON.stringify(statsNow.q || {})),
    },
    /** 今回のクイズで新たに習得した問題（回答時に entry を保持） */
    sessionNewChoiceMastered: new Map(),
    sessionNewInputMastered: new Map(),
  };
  showScreen("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = quiz.questions[quiz.idx];
  const e = q.entry;
  const total = quiz.questions.length;

  $("quiz-progress-text").textContent = `第 ${quiz.idx + 1} 問 / 全 ${total} 問`;
  $("quiz-score").textContent = `ここまでの正解: ${quiz.correctCount}問`;
  $("quiz-progress-bar").style.width = Math.round((quiz.idx / total) * 100) + "%";

  // モジュール・分野は答えのヒントになってしまうので、出題中は表示しない
  // （ショートカットだけはアプリが分からないと解けないので分野を出す）
  let metaHtml = `<span class="badge">${escapeHtml(CATEGORIES[e.category] || e.category)}</span>`;
  if (e.category === "shortcut" && e.module) {
    const modLabel =
      typeof MODULES !== "undefined" && MODULES[e.module] ? MODULES[e.module] : e.module;
    metaHtml += `<span class="badge badge-module">${escapeHtml(modLabel)}</span>`;
  }
  metaHtml += `<span class="badge priority-${e.priority}">${escapeHtml(PRIORITIES[e.priority])}</span>`;
  $("question-meta").innerHTML = metaHtml;

  $("question-text").innerHTML = questionText(q);

  const box = $("choices");
  box.innerHTML = "";
  box.classList.remove("judgment-mode", "judgment-multi-mode", "abbr-mode", "reorder-mode", "cloze-mode");
  const inputArea = $("input-area");
  const input = $("answer-input");
  $("abbr-progress").classList.add("hidden");
  $("judgment-multi-actions").classList.add("hidden");
  const reorderBoard = $("reorder-board");
  if (reorderBoard) {
    reorderBoard.classList.add("hidden");
    reorderBoard.innerHTML = "";
  }
  const clozePrompt = $("cloze-prompt");
  if (clozePrompt) {
    clozePrompt.classList.add("hidden");
    clozePrompt.innerHTML = "";
  }

  if (q.isReorder) {
    inputArea.classList.add("hidden");
    box.classList.remove("hidden");
    box.classList.add("reorder-mode");
    q.sequence = [];
    q.poolOrder = shuffle(q.stepLabels.map((_, i) => i));
    renderReorderBoard();
  } else if (q.isCloze) {
    inputArea.classList.add("hidden");
    box.classList.remove("hidden");
    box.classList.add("cloze-mode", "abbr-mode");
    q.selections = [];
    q.blankIdx = 0;
    renderClozePrompt();
    renderClozeChoices();
  } else if (q.isAbbr) {
    inputArea.classList.add("hidden");
    box.classList.remove("hidden");
    box.classList.add("abbr-mode");
    q.selections = [];
    renderAbbrPart();
  } else if (q.inputMode) {
    box.classList.add("hidden");
    inputArea.classList.remove("hidden");
    input.value = "";
    input.disabled = false;
    input.classList.remove("correct", "wrong");
    $("answer-submit-btn").disabled = false;
    input.focus();
  } else if (q.isJudgmentMulti) {
    inputArea.classList.add("hidden");
    box.classList.remove("hidden", "judgment-mode");
    box.classList.add("judgment-multi-mode");
    q.selectedIndices = [];
    q.statements.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.innerHTML = `<span class="choice-key">${choiceKey(i)}</span><span class="choice-label">${escapeHtml(text)}</span>`;
      btn.addEventListener("click", () => toggleJudgmentMulti(i));
      box.appendChild(btn);
    });
    $("judgment-multi-actions").classList.remove("hidden");
    $("judgment-submit-btn").disabled = false;
  } else {
    inputArea.classList.add("hidden");
    box.classList.remove("hidden", "judgment-multi-mode");
    box.classList.toggle("judgment-mode", q.direction === "judgment");
    q.choices.forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.innerHTML = `<span class="choice-key">${choiceKey(i)}</span><span class="choice-label">${escapeHtml(choice)}</span>`;
      btn.addEventListener("click", () => answer(i));
      box.appendChild(btn);
    });
  }

  clearScheduledNextBtnFocus();
  clearFeedbackCard();
  resetQuestionReportForm();

  // みんなの正答率を回答前に先読み（回答直後はキャッシュを即表示）
  if (typeof QuestionStats !== "undefined" && QuestionStats.isAvailable()) {
    QuestionStats.prefetch(e.id);
    const nextQ = quiz.questions[quiz.idx + 1];
    if (nextQ) QuestionStats.prefetch(nextQ.entry.id);
  }
}

/** フィードバックカードを隠し、解説など前問のDOM残りを消す */
let questionGlobalRateSeq = 0;

function clearFeedbackCard() {
  questionGlobalRateSeq += 1;
  const card = $("feedback-card");
  if (card) {
    card.classList.add("hidden");
    card.classList.remove("is-correct", "is-wrong");
    delete card.dataset.forQuestion;
  }
  const result = $("feedback-result");
  if (result) result.textContent = "";
  const answer = $("feedback-answer");
  if (answer) answer.innerHTML = "";
  const expEl = $("feedback-explanation");
  if (expEl) {
    // 複数選択の innerHTML 残りを確実に消す（次問で textContent だけだと稀に古い表示が残る）
    expEl.innerHTML = "";
  }
  const globalRateEl = $("question-global-rate");
  if (globalRateEl) {
    globalRateEl.classList.add("hidden");
    globalRateEl.textContent = "";
  }
}

/** みんなの正答率テキストを要素へ反映（自分の今回分は含めない集計） */
function paintQuestionGlobalRate(el, label, stat, isInput) {
  const rate = QuestionStats.formatRate(stat, !!isInput);
  if (!rate) {
    el.textContent = `${label}: まだデータなし`;
    return;
  }
  let text = `${label}: ${rate.pct}%（${rate.attempts}回）`;
  if (rate.attempts < 10) text += " ※回答数が少ないため参考値";
  el.textContent = text;
}

/** 全ユーザの平均正答率をフィードバックに表示（記述式は選択式と別集計） */
function showQuestionGlobalRate(questionId, isCorrect, isInput) {
  const el = $("question-global-rate");
  if (!el || typeof QuestionStats === "undefined" || !QuestionStats.isAvailable()) {
    if (el) el.classList.add("hidden");
    return;
  }

  const seq = ++questionGlobalRateSeq;
  const label = isInput ? "みんなの正答率（記述式）" : "みんなの正答率";
  el.classList.remove("hidden");

  const paint = (stat) => {
    if (seq !== questionGlobalRateSeq) return;
    paintQuestionGlobalRate(el, label, stat, isInput);
  };

  // 自分の回答を書き込む前の集計を表示（prefetch済みなら即時）
  const statsMeta = {
    subjectId: CURRENT_SUBJECT && CURRENT_SUBJECT.id ? CURRENT_SUBJECT.id : "",
  };
  const cached = QuestionStats.peek(questionId);
  if (cached) {
    paint(cached);
    QuestionStats.recordAttempt(questionId, isCorrect, !!isInput, statsMeta).catch((err) => {
      console.error("みんなの正答率の記録に失敗:", err);
    });
    return;
  }

  el.textContent = `${label}: 集計中…`;
  QuestionStats.fetch(questionId)
    .then((stat) => {
      paint(stat);
      return QuestionStats.recordAttempt(questionId, isCorrect, !!isInput, statsMeta);
    })
    .catch((err) => {
      if (seq !== questionGlobalRateSeq) return;
      console.error("みんなの正答率の取得に失敗:", err);
      el.textContent = `${label}: 集計を表示できません`;
    });
}


/**
 * 略称／ショートカット部品問題: 現在の部品の選択肢と、これまでの選択状況を描画する。
 * 途中で間違えても指摘せず最後まで選ばせ、全部一致で正解にする。
 */
function renderAbbrPart() {
  const q = quiz.questions[quiz.idx];
  const partIdx = q.selections.length;
  const defs = q.partDefs || q.entry.parts;

  const prog = $("abbr-progress");
  prog.classList.remove("hidden");
  if (q.isShortcutParts) {
    // 機能名 = キーを1つずつ組み立て（学習道場と同じ）
    prog.innerHTML =
      `<span class="abbr-code">${escapeHtml(q.entry.name)}</span><span class="abbr-eq">=</span>` +
      defs
        .map((p, i) => {
          if (i < partIdx) {
            return `<span class="abbr-word chosen">${escapeHtml(q.selections[i])}</span>`;
          }
          if (i === partIdx) {
            return `<span class="abbr-word current">${i + 1}キー目？</span>`;
          }
          return `<span class="abbr-word pending">?</span>`;
        })
        .join(`<span class="abbr-eq">+</span>`);
  } else {
    prog.innerHTML =
      `<span class="abbr-code">${escapeHtml(q.entry.code)}</span><span class="abbr-eq">=</span>` +
      defs
        .map((p, i) => {
          if (i < partIdx) return `<span class="abbr-word chosen">${escapeHtml(q.selections[i])}</span>`;
          if (i === partIdx) return `<span class="abbr-word current">${i + 1}語目？</span>`;
          return `<span class="abbr-word pending">?</span>`;
        })
        .join(" ");
  }

  const box = $("choices");
  box.innerHTML = "";
  q.parts[partIdx].choices.forEach((choice, i) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerHTML = `<span class="choice-key">${choiceKey(i)}</span><span class="choice-label">${escapeHtml(choice)}</span>`;
    btn.addEventListener("click", () => abbrSelect(i));
    box.appendChild(btn);
  });
}

/** 略称／ショートカット部品の1つ分の選択。最後まで選んだら正誤を確定する */
function abbrSelect(choiceIndex) {
  const q = quiz.questions[quiz.idx];
  const partIdx = q.selections.length;
  const defs = q.partDefs || q.entry.parts;
  q.selections.push(q.parts[partIdx].choices[choiceIndex]);

  if (q.selections.length < q.parts.length) {
    renderAbbrPart();
    return;
  }

  const isCorrect = q.selections.every((sel, i) => sel === defs[i].answer);
  const prog = $("abbr-progress");
  if (q.isShortcutParts) {
    prog.innerHTML =
      `<span class="abbr-code">${escapeHtml(q.entry.name)}</span><span class="abbr-eq">=</span>` +
      defs
        .map((p, i) => {
          const ok = q.selections[i] === p.answer;
          return `<span class="abbr-word ${ok ? "ok" : "ng"}">${escapeHtml(q.selections[i])}</span>`;
        })
        .join(`<span class="abbr-eq">+</span>`);
  } else {
    prog.innerHTML =
      `<span class="abbr-code">${escapeHtml(q.entry.code)}</span><span class="abbr-eq">=</span>` +
      defs
        .map((p, i) => {
          const ok = q.selections[i] === p.answer;
          return `<span class="abbr-word ${ok ? "ok" : "ng"}">${escapeHtml(q.selections[i])}</span>`;
        })
        .join(" ");
  }
  $("choices").querySelectorAll(".choice-btn").forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("dimmed");
  });

  const given = q.isShortcutParts ? q.selections.join("+") : q.selections.join(" ");
  finishAnswer(isCorrect, given);
}

/** 並べ替え: スロット（確定順）と候補プールを描画 */
function renderReorderBoard() {
  const q = quiz.questions[quiz.idx];
  const board = $("reorder-board");
  const box = $("choices");
  if (!board) return;
  board.classList.remove("hidden");
  board.innerHTML =
    `<div class="reorder-slots" id="reorder-slots"></div>` +
    `<p class="reorder-hint">候補を正しい順にタップ。埋めた枠をタップすると戻せます（${q.sequence.length}/${q.stepLabels.length}）</p>`;

  const slots = $("reorder-slots");
  q.stepLabels.forEach((_, i) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "reorder-slot" + (q.sequence[i] != null ? " filled" : " empty");
    if (q.sequence[i] != null) {
      slot.innerHTML =
        `<span class="reorder-num">${i + 1}</span>` +
        `<span class="reorder-label">${escapeHtml(q.stepLabels[q.sequence[i]])}</span>`;
      slot.addEventListener("click", () => reorderUndo(i));
    } else {
      slot.innerHTML = `<span class="reorder-num">${i + 1}</span><span class="reorder-label">（未選択）</span>`;
      slot.disabled = true;
    }
    slots.appendChild(slot);
  });

  box.innerHTML = "";
  q.poolOrder.forEach((stepIdx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.innerHTML =
      `<span class="choice-key">＋</span>` +
      `<span class="choice-label">${escapeHtml(q.stepLabels[stepIdx])}</span>`;
    btn.addEventListener("click", () => reorderPick(stepIdx));
    box.appendChild(btn);
  });
}

function reorderPick(stepIdx) {
  const q = quiz.questions[quiz.idx];
  if ($("feedback-card") && !$("feedback-card").classList.contains("hidden")) return;
  const poolPos = q.poolOrder.indexOf(stepIdx);
  if (poolPos < 0) return;
  q.poolOrder.splice(poolPos, 1);
  q.sequence.push(stepIdx);
  renderReorderBoard();
  if (q.sequence.length < q.stepLabels.length) return;

  const isCorrect = q.sequence.every((idx, i) => idx === i);
  $("choices").querySelectorAll(".choice-btn").forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("dimmed");
  });
  $("reorder-board").querySelectorAll(".reorder-slot").forEach((btn) => {
    btn.disabled = true;
  });
  const given = q.sequence.map((i) => q.stepLabels[i]).join(" → ");
  finishAnswer(isCorrect, given);
}

function reorderUndo(slotIdx) {
  const q = quiz.questions[quiz.idx];
  if ($("feedback-card") && !$("feedback-card").classList.contains("hidden")) return;
  if (q.sequence[slotIdx] == null) return;
  // 指定枠以降をすべてプールへ戻す（途中抜きで順序が壊れないようにする）
  const removed = q.sequence.splice(slotIdx);
  q.poolOrder = shuffle(q.poolOrder.concat(removed));
  renderReorderBoard();
}

/** 穴埋めプロンプト: [[0]] をスロット表示に置換 */
function renderClozePrompt() {
  const q = quiz.questions[quiz.idx];
  const el = $("cloze-prompt");
  if (!el) return;
  el.classList.remove("hidden");
  const raw = q.entry.prompt || q.entry.name || "";
  const working = raw.replace(/\[\[(\d+)\]\]/g, (_, n) => `§CLOZE${Number(n)}§`);
  let html = formatRichText(working);
  q.blanks.forEach((b, i) => {
    const filled = q.selections[i];
    let slot;
    if (filled != null) {
      const decided = q.selections.length === q.blanks.length;
      const okClass = filled === b.answer ? "ok" : decided ? "ng" : "chosen";
      slot = `<span class="cloze-slot ${okClass}">${escapeHtml(filled)}</span>`;
    } else if (i === q.blankIdx) {
      slot = `<span class="cloze-slot current">（${i + 1}）</span>`;
    } else {
      slot = `<span class="cloze-slot pending">（${i + 1}）</span>`;
    }
    html = html.split(`§CLOZE${i}§`).join(slot);
  });
  el.innerHTML = html;
}

function renderClozeChoices() {
  const q = quiz.questions[quiz.idx];
  const box = $("choices");
  box.innerHTML = "";
  const blank = q.blanks[q.blankIdx];
  if (!blank) return;
  blank.choices.forEach((choice, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.innerHTML = `<span class="choice-key">${choiceKey(i)}</span><span class="choice-label"><code class="inline-code">${escapeHtml(choice)}</code></span>`;
    btn.addEventListener("click", () => clozeSelect(i));
    box.appendChild(btn);
  });
}

function clozeSelect(choiceIndex) {
  const q = quiz.questions[quiz.idx];
  if ($("feedback-card") && !$("feedback-card").classList.contains("hidden")) return;
  const blank = q.blanks[q.blankIdx];
  q.selections.push(blank.choices[choiceIndex]);
  q.blankIdx += 1;
  if (q.blankIdx < q.blanks.length) {
    renderClozePrompt();
    renderClozeChoices();
    return;
  }
  const isCorrect = q.selections.every((sel, i) => sel === q.blanks[i].answer);
  renderClozePrompt();
  $("choices").querySelectorAll(".choice-btn").forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("dimmed");
  });
  finishAnswer(isCorrect, q.selections.join(" / "));
}

function moduleLabel(key) {
  if (key === "GUI") return MODULES["共通"] || "共通";
  return MODULES[key] || key;
}

/** 正誤確定後の共通処理（成績記録とフィードバック表示） */
function finishAnswer(isCorrect, givenText) {
  const q = quiz.questions[quiz.idx];
  if (!q || q._answered) return;
  q._answered = true;

  const questionId = q.entry.id;
  if (isCorrect) quiz.correctCount += 1;
  else quiz.wrongs.push({ q, given: givenText });

  const stats = QuizStorage.load();
  const qsBefore = stats.q[questionId];
  const wasChoiceMastered = !q.inputMode && QuizStorage.isChoiceMastered(qsBefore);
  const wasInputMastered = !!q.inputMode && (qsBefore?.ik || 0) >= 2;

  QuizStorage.record(questionId, isCorrect, !!q.inputMode);
  if (CURRENT_SUBJECT && typeof Entitlement !== "undefined") {
    Entitlement.recordAnswer(CURRENT_SUBJECT.id);
  }

  const qsAfter = QuizStorage.load().q[questionId];
  if (!q.inputMode) {
    const nowChoiceMastered = QuizStorage.isChoiceMastered(qsAfter);
    if (!wasChoiceMastered && nowChoiceMastered) {
      quiz.sessionNewChoiceMastered.set(questionId, q.entry);
    } else if (wasChoiceMastered && !nowChoiceMastered) {
      quiz.sessionNewChoiceMastered.delete(questionId);
    }
  } else if (INPUT_CATEGORIES.has(q.entry.category)) {
    const nowInputMastered = (qsAfter?.ik || 0) >= 2;
    if (!wasInputMastered && nowInputMastered) {
      quiz.sessionNewInputMastered.set(questionId, q.entry);
    } else if (wasInputMastered && !nowInputMastered) {
      quiz.sessionNewInputMastered.delete(questionId);
    }
  }

  // カードを出す前に中身を全部書き換える（前問の解説が一瞬・稀に残るのを防ぐ）
  $("feedback-result").textContent = isCorrect ? "正解！" : "不正解…";

  let answerHtml;
  if (q.isReorder) {
    answerHtml = `正解: ${escapeHtml(q.stepLabels.join(" → "))}`;
  } else if (q.isCloze) {
    answerHtml = `正解: ${escapeHtml(q.blanks.map((b) => b.answer).join(" / "))}`;
  } else if (q.isShortcutParts) {
    answerHtml = `正解: <code>${escapeHtml(q.entry.code)}</code> — ${escapeHtml(q.entry.name)}`;
  } else if (q.isAbbr) {
    answerHtml = `正解: <code>${escapeHtml(q.entry.code)}</code> = ${escapeHtml(q.entry.name)}`;
  } else if (q.isJudgmentMulti) {
    answerHtml = `正解: ${escapeHtml(judgmentMultiAnswerLabel(q, q.targetIndices))}`;
  } else if (q.entry.category === "judgment" && q.direction === "judgment") {
    answerHtml = `正解: ${escapeHtml(judgmentSingleAnswer(q.entry))}`;
  } else if (q.choices && q.choices.length) {
    answerHtml = `正解: ${escapeHtml(q.choices[q.answerIndex])}`;
  } else {
    answerHtml = `正解: <code>${escapeHtml(q.entry.code)}</code> — ${escapeHtml(q.entry.name)}`;
  }
  $("feedback-answer").innerHTML =
    `<div class="feedback-module">分野: ${escapeHtml(moduleLabel(q.entry.module))}</div>` +
    `<div class="feedback-answer-text">${answerHtml}</div>`;

  const expEl = $("feedback-explanation");
  try {
    if (q.isJudgmentMulti) {
      expEl.innerHTML = buildJudgmentMultiExplanationHtml(q);
    } else {
      expEl.innerHTML = formatRichText(buildFeedbackExplanation(q, isCorrect, givenText));
    }
  } catch (err) {
    console.error("解説の生成に失敗:", err);
    expEl.innerHTML = formatRichText(q.entry.explanation || "");
  }
  if (!(expEl.textContent || "").trim() && !expEl.querySelector(".jmulti-exp, .code-block, .inline-code")) {
    expEl.innerHTML = formatRichText(q.entry.explanation || "（解説データがありません）");
  }

  resetQuestionReportForm();
  $("question-report").open = false;
  if (QuestionReports.isAvailable()) {
    $("question-report").classList.remove("hidden");
  } else {
    $("question-report").classList.add("hidden");
  }
  quiz.lastFeedback = { isCorrect, givenText };
  showQuestionGlobalRate(questionId, isCorrect, !!q.inputMode);
  $("next-btn").textContent = quiz.idx === quiz.questions.length - 1 ? "結果を見る" : "次の問題へ";

  const card = $("feedback-card");
  card.dataset.forQuestion = questionId;
  card.classList.remove("hidden", "is-correct", "is-wrong");
  card.classList.add(isCorrect ? "is-correct" : "is-wrong");
  scheduleNextBtnFocus();
}

/** scheduleNextBtnFocus の解除（次問へ進む／重ね掛け防止） */
let cancelScheduledNextBtnFocus = null;

function clearScheduledNextBtnFocus() {
  if (cancelScheduledNextBtnFocus) {
    cancelScheduledNextBtnFocus();
    cancelScheduledNextBtnFocus = null;
  }
}

/**
 * 「次へ」へフォーカスする。
 * 記述式で Enter 回答した直後にフォーカスすると、環境によって次問へ飛んで解説が消えるため、
 * 少し遅らせてからフォーカスする（keyup 連動は使わない）。
 */
function scheduleNextBtnFocus() {
  clearScheduledNextBtnFocus();
  const btn = $("next-btn");
  let done = false;
  const doFocus = () => {
    if (done) return;
    done = true;
    cancelScheduledNextBtnFocus = null;
    if (
      !$("screen-quiz").classList.contains("hidden") &&
      !$("feedback-card").classList.contains("hidden")
    ) {
      btn.focus();
    }
  };
  // Enter 回答の keyup とぶつからないよう余裕を持たせる
  const timer = setTimeout(doFocus, 500);
  cancelScheduledNextBtnFocus = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
  };
}

/** 選択式の回答 */
function answer(selectedIndex) {
  const q = quiz.questions[quiz.idx];
  const isCorrect = selectedIndex === q.answerIndex;

  // 選択肢の色分け
  const buttons = $("choices").querySelectorAll(".choice-btn");
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answerIndex) btn.classList.add("correct");
    else if (i === selectedIndex) btn.classList.add("wrong");
    else btn.classList.add("dimmed");
  });

  finishAnswer(isCorrect, q.choices[selectedIndex]);
}

/** 正誤（複数選択）: 選択のトグル */
function toggleJudgmentMulti(index) {
  const q = quiz.questions[quiz.idx];
  if (!q.isJudgmentMulti || !$("feedback-card").classList.contains("hidden")) return;
  const pos = q.selectedIndices.indexOf(index);
  if (pos >= 0) q.selectedIndices.splice(pos, 1);
  else q.selectedIndices.push(index);
  $("choices").querySelectorAll(".choice-btn").forEach((btn, i) => {
    btn.classList.toggle("selected", q.selectedIndices.includes(i));
  });
}

/** 正誤（複数選択）: 回答確定 */
function answerJudgmentMulti() {
  const q = quiz.questions[quiz.idx];
  if (!q.isJudgmentMulti || !$("feedback-card").classList.contains("hidden")) return;

  const selected = q.selectedIndices.slice().sort((a, b) => a - b);
  const target = q.targetIndices.slice().sort((a, b) => a - b);
  const isCorrect =
    selected.length === target.length &&
    selected.every((v, i) => v === target[i]);

  const buttons = $("choices").querySelectorAll(".choice-btn");
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.remove("selected");
    const picked = selected.includes(i);
    const shouldPick = target.includes(i);
    if (picked && shouldPick) btn.classList.add("correct");
    else if (picked && !shouldPick) btn.classList.add("wrong");
    else if (!picked && shouldPick) btn.classList.add("missed");
    else btn.classList.add("dimmed");
  });
  $("judgment-submit-btn").disabled = true;

  const givenText = selected.length
    ? judgmentMultiAnswerLabel(q, selected)
    : "（未選択）";
  finishAnswer(isCorrect, givenText);
}

/** 記述式の回答 */
function answerTyped() {
  const input = $("answer-input");
  if (input.disabled) return;
  const raw = input.value;
  if (normalizeCode(raw) === "") return; // 空のまま回答はさせない

  const q = quiz.questions[quiz.idx];
  const isCorrect = termAnswerMatches(q.entry, raw);

  input.disabled = true;
  $("answer-submit-btn").disabled = true;
  input.classList.add(isCorrect ? "correct" : "wrong");

  finishAnswer(isCorrect, raw.trim());
}

function nextQuestion() {
  clearScheduledNextBtnFocus();
  if (quiz.idx === quiz.questions.length - 1) {
    clearFeedbackCard();
    renderResult();
    showScreen("result");
  } else {
    quiz.idx += 1;
    renderQuestion();
    window.scrollTo(0, 0); // フィードバックで下にスクロールした状態から、次の問題は先頭から見せる
  }
}
