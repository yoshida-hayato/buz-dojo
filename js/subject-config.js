/** 科目設定の注入・ブランディング */

function applySubjectConfig(subject) {
  CURRENT_SUBJECT = subject;
  CATEGORIES = Object.assign({}, subject.categories || {});
  MODULES = Object.assign({}, subject.modules || {});
  MODULE_FILTERABLE = new Set(
    subject.moduleFilterable || ["tcode", "term", "scenario", "judgment", "reorder", "cloze"]
  );
  INPUT_CATEGORIES = new Set(subject.inputCategories || []);
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
  const answerModeGroup = document.getElementById("answer-mode-group");
  if (answerModeGroup) answerModeGroup.classList.toggle("hidden", !subjectUsesInput());
}

function subjectUsesInput() {
  return INPUT_CATEGORIES && INPUT_CATEGORIES.size > 0;
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
}


function choiceKey(i) {
  return CHOICE_KEYS[i] || String(i + 1);
}

/** 単一正誤の正解ラベル（A=正・B=誤で固定表示） */
function judgmentSingleAnswer(entry) {
  if (entry.answer === "正" || entry.answer === "誤") return entry.answer;
  return entry.choices && entry.choices[0] === "誤" ? "誤" : "正";
}

function judgmentSingleAnswerIndex(entry) {
  return judgmentSingleAnswer(entry) === "正" ? 0 : 1;
}
