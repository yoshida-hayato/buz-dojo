/** お問い合わせ・問題指摘 UI */

/** 問題の登録正解テキスト（報告用） */
function termAnswerMatches(entry, raw) {
  const normalized = normalizeCode(raw);
  if (normalized === normalizeCode(entry.code)) return true;
  if (entry.codeAliases) {
    return entry.codeAliases.some((a) => normalizeCode(a) === normalized);
  }
  return false;
}

function getRegisteredAnswerText(q) {
  if (q.isReorder) return q.stepLabels.join(" → ");
  if (q.isCloze) return q.blanks.map((b) => b.answer).join(" / ");
  if (q.isShortcutParts) return `${q.entry.code} — ${q.entry.name}`;
  if (q.isAbbr) return `${q.entry.code} = ${q.entry.name}`;
  if (q.isJudgmentMulti) return judgmentMultiAnswerLabel(q, q.targetIndices);
  if (q.direction === "scenario") return q.entry.choices[0];
  if (q.direction === "judgment" || (q.entry.category === "judgment" && q.entry.choices)) {
    return judgmentSingleAnswer(q.entry);
  }
  if (q.direction === "name2code") {
    const e = q.entry;
    if (e.codeAliases && e.codeAliases.length) {
      return `${e.code}（${e.codeAliases.join("／")} も可）`;
    }
    return e.code;
  }
  return `${q.entry.code} — ${q.entry.name}`;
}

function getQuestionDisplayText(q) {
  const e = q.entry;
  if (e.name) return e.name;
  return e.code || e.id;
}

function resetQuestionReportForm() {
  const msg = $("question-report-message");
  const status = $("question-report-status");
  const reasons = $("question-report-reasons");
  if (!msg) return;
  msg.value = "";
  msg.disabled = false;
  if (typeof QuestionReports !== "undefined") {
    QuestionReports.clearReasonOptions(reasons);
  }
  $("question-report-submit").disabled = false;
  status.classList.add("hidden");
  status.classList.remove("is-success", "is-error");
  status.textContent = "";
}

function initContactForm() {
  const categoryEl = $("contact-category");
  const submitBtn = $("contact-submit");
  if (!categoryEl || !submitBtn) return;

  if (typeof SiteInquiries !== "undefined" && SiteInquiries.CATEGORY_OPTIONS) {
    categoryEl.innerHTML = SiteInquiries.CATEGORY_OPTIONS.map(
      (c) => `<option value="${c.id}">${c.label}</option>`
    ).join("");
  }

  if (typeof SiteInquiries === "undefined" || !SiteInquiries.isAvailable()) {
    submitBtn.disabled = true;
    const status = $("contact-status");
    if (status) {
      status.classList.remove("hidden");
      status.textContent = "お問い合わせ機能は現在利用できません。";
      status.classList.add("is-error");
    }
    return;
  }

  submitBtn.addEventListener("click", async () => {
    const statusEl = $("contact-status");
    const msgEl = $("contact-message");
    submitBtn.disabled = true;
    statusEl.classList.remove("hidden", "is-success", "is-error");
    statusEl.textContent = "送信中…";
    try {
      await SiteInquiries.submit({
        category: categoryEl.value,
        message: msgEl.value,
        page: location.hash || "contact",
        subjectId: CURRENT_SUBJECT ? CURRENT_SUBJECT.id : "",
        subjectTitle: CURRENT_SUBJECT
          ? CURRENT_SUBJECT.shortTitle || CURRENT_SUBJECT.title || ""
          : "",
      });
      statusEl.textContent = "送信しました。ありがとうございます。";
      statusEl.classList.add("is-success");
      msgEl.value = "";
      msgEl.disabled = true;
    } catch (e) {
      statusEl.textContent = e.message || "送信に失敗しました。";
      statusEl.classList.add("is-error");
      submitBtn.disabled = false;
    }
  });
}

function showContactScreen() {
  const run = () => {
    const statusEl = $("contact-status");
    const msgEl = $("contact-message");
    const submitBtn = $("contact-submit");
    if (msgEl) {
      msgEl.disabled = false;
      if (statusEl && statusEl.classList.contains("is-success")) {
        msgEl.value = "";
        statusEl.classList.add("hidden");
        statusEl.classList.remove("is-success", "is-error");
        statusEl.textContent = "";
        if (submitBtn) submitBtn.disabled = false;
      }
    }
    showScreen("contact");
  };
  ensureSiteInquiries()
    .then(run)
    .catch((e) => {
      console.warn(e);
      run();
      const status = $("contact-status");
      const submitBtn = $("contact-submit");
      if (status) {
        status.classList.remove("hidden");
        status.textContent = "お問い合わせ機能の読込に失敗しました。";
        status.classList.add("is-error");
      }
      if (submitBtn) submitBtn.disabled = true;
    });
}

function initQuestionReports() {
  const submitBtn = $("question-report-submit");
  if (!submitBtn || typeof QuestionReports === "undefined") return;

  QuestionReports.renderReasonOptions($("question-report-reasons"));

  submitBtn.addEventListener("click", async () => {
    const q = quiz.questions[quiz.idx];
    const fb = quiz.lastFeedback;
    if (!q || !fb) return;

    const statusEl = $("question-report-status");
    const msgEl = $("question-report-message");
    const reasonsEl = $("question-report-reasons");
    submitBtn.disabled = true;
    statusEl.classList.remove("hidden", "is-success", "is-error");
    statusEl.textContent = "送信中…";

    try {
      await QuestionReports.submit({
        questionId: q.entry.id,
        subjectId: CURRENT_SUBJECT ? CURRENT_SUBJECT.id : "",
        subjectTitle: CURRENT_SUBJECT
          ? CURRENT_SUBJECT.shortTitle || CURRENT_SUBJECT.title || ""
          : "",
        questionCategory: q.entry.category,
        questionModule: q.entry.module,
        questionCode: q.entry.code || "",
        questionText: getQuestionDisplayText(q),
        registeredAnswer: getRegisteredAnswerText(q),
        userAnswer: fb.givenText || "",
        wasCorrect: fb.isCorrect,
        reasonIds: QuestionReports.selectedReasonIds(reasonsEl),
        message: msgEl.value,
      });
      statusEl.textContent = "送信しました。ありがとうございます。";
      statusEl.classList.add("is-success");
      msgEl.disabled = true;
      QuestionReports.disableReasonOptions(reasonsEl, true);
    } catch (e) {
      statusEl.textContent = e.message || "送信に失敗しました。";
      statusEl.classList.add("is-error");
      submitBtn.disabled = false;
    }
  });
}
