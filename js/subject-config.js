/** 科目設定の注入・ブランディング */

function applySubjectConfig(subject) {
  CURRENT_SUBJECT = subject;
  CATEGORIES = Object.assign({}, subject.categories || {});
  MODULES = Object.assign({}, subject.modules || {});
  MODULE_FILTERABLE = new Set(
    subject.moduleFilterable || ["tcode", "term", "scenario", "judgment", "reorder", "cloze"]
  );
  INPUT_CATEGORIES = new Set(subject.inputCategories || []);
  DEFAULT_CATEGORIES = Array.isArray(subject.defaultCategories)
    ? subject.defaultCategories.filter((c) => Object.prototype.hasOwnProperty.call(CATEGORIES, c))
    : null;
  RANKS =
    Array.isArray(subject.ranks) && subject.ranks.length
      ? subject.ranks.slice()
      : DEFAULT_RANKS.slice();
  if (!subjectUsesInput()) {
    RANKS = RANKS.map((r) => {
      const copy = Object.assign({}, r);
      delete copy.inputCorrectRatio;
      delete copy.minInputAcc;
      delete copy.minInputMasteredPct;
      return copy;
    });
  }
  applyBranding(subject);
  applySubjectSettingVisibility();
}

/** Tコード記述式を使う科目か（生管・ショートカットは false） */
function subjectUsesInput() {
  return INPUT_CATEGORIES && INPUT_CATEGORIES.size > 0;
}

/** 記述式の回答実績があるか（初回判定用） */
function hasInputAnswerExperience() {
  if (typeof QuizStorage === "undefined" || typeof QuizStorage.load !== "function") {
    return false;
  }
  try {
    const s = QuizStorage.load();
    if ((Number(s && s.inputAnswered) || 0) > 0) return true;
    if (Array.isArray(s && s.inputLog) && s.inputLog.length > 0) return true;
    const q = s && s.q;
    if (q && typeof q === "object") {
      for (const id of Object.keys(q)) {
        if ((Number(q[id] && q[id].ia) || 0) > 0) return true;
      }
    }
  } catch (e) {
    /* ignore */
  }
  return false;
}

/**
 * SAPホーム等の解答方式デフォルト。
 * 初回／記述式未実績は選択式。実績があれば両方出題。
 */
function defaultAnswerModeForSubject() {
  if (!subjectUsesInput()) return "choice";
  return hasInputAnswerExperience() ? "both" : "choice";
}

/**
 * 出題形式（コード⇔機能）セレクトを出すか。
 * Tコード科目のみ。ショートカットはキー選択固定のため出さない（Tコード前提UIを避ける）。
 */
function subjectUsesDirection() {
  return !!(CATEGORIES && CATEGORIES.tcode);
}

/** 科目に応じて不要セレクトを隠し、ヒント文言を差し替える */
function applySubjectSettingVisibility() {
  const usesInput = subjectUsesInput();
  const usesDirection = subjectUsesDirection();

  const answerModeGroup = document.getElementById("answer-mode-group");
  if (answerModeGroup) answerModeGroup.classList.toggle("hidden", !usesInput);
  const directionGroup = document.getElementById("direction-group");
  if (directionGroup) directionGroup.classList.toggle("hidden", !usesDirection);
  const dirAnsRow = document.getElementById("direction-answer-row");
  if (dirAnsRow) dirAnsRow.classList.toggle("hidden", !usesDirection && !usesInput);

  // 非対応科目では値も中立化（hidden でも getSettings 前に漏れないよう）
  // 対応科目に戻したときは既定値へ復元（初回／記述式未実績は選択式）
  const answerModeSelect = document.getElementById("answer-mode-select");
  if (answerModeSelect) {
    if (!usesInput) {
      answerModeSelect.dataset.neutralized = "1";
      answerModeSelect.value = "choice";
    } else if (answerModeSelect.dataset.neutralized === "1") {
      answerModeSelect.value = defaultAnswerModeForSubject();
      delete answerModeSelect.dataset.neutralized;
    } else if (!answerModeSelect.dataset.userSet) {
      answerModeSelect.value = defaultAnswerModeForSubject();
    }
  }
  const directionSelect = document.getElementById("direction-select");
  if (directionSelect) {
    if (!usesDirection) {
      directionSelect.dataset.neutralized = "1";
      directionSelect.value = "name2code";
    } else if (directionSelect.dataset.neutralized === "1") {
      directionSelect.value = "mixed";
      delete directionSelect.dataset.neutralized;
    }
  }

  const poolHint = document.getElementById("pool-mode-hint");
  if (poolHint) {
    poolHint.textContent = usesInput
      ? "※ 選択式の習得と記述式の習得は別です。「両方出題」ではTコードを選択式枠・記述式枠で二重に数え、各枠で未習得のものだけ出します。"
      : "※ 「未習得のみ」は2回連続正解した問題を外します。出題できなくなったら「すべての問題」に切り替えてください。";
  }
  const catHint = document.getElementById("category-count-hint");
  if (catHint) {
    catHint.textContent = usesInput
      ? "件数は、モジュール・優先度・出題対象・解答方式に合う問題数です。"
      : "件数は、モジュール・優先度・出題対象に合う問題数です。";
  }
  const modHint = document.getElementById("module-count-hint");
  if (modHint) {
    modHint.textContent = usesInput
      ? "件数は、カテゴリ・優先度・出題対象・解答方式に合う問題数です。"
      : "件数は、カテゴリ・優先度・出題対象に合う問題数です。";
  }
}


function applyBranding(subject) {
  const brand = subject.brand || "ビジネス道場";
  const accent = subject.brandAccentWord || "道場";
  const titleEl = document.getElementById("site-title");
  if (titleEl) {
    const base = brand.endsWith(accent) ? brand.slice(0, -accent.length) : brand;
    titleEl.innerHTML = escapeHtml(base) + "<span>" + escapeHtml(accent) + "</span>";
  }
  document.title = brand + " - " + (subject.shortTitle || subject.title || "");
  const note = document.querySelector(".home-note");
  if (note && subject.homeNote) note.textContent = subject.homeNote;
  const subLabel = document.getElementById("current-subject-label");
  if (subLabel) subLabel.textContent = subject.shortTitle || subject.title || "";
  const expectEl = document.getElementById("start-expect-note");
  if (expectEl) {
    const expect = (subject.startExpect || "").trim();
    if (expect) {
      expectEl.textContent = expect;
      expectEl.classList.remove("hidden");
    } else {
      expectEl.textContent = "";
      expectEl.classList.add("hidden");
    }
  }
}


function choiceKey(i) {
  return CHOICE_KEYS[i] || String(i + 1);
}

/** 単一正誤の正解ラベル（「正」または「誤」。表示位置は quiz-builder でシャッフル） */
function judgmentSingleAnswer(entry) {
  if (entry.answer === "正" || entry.answer === "誤") return entry.answer;
  return entry.choices && entry.choices[0] === "誤" ? "誤" : "正";
}
