/**
 * 問題の指摘を Firestore に送信する
 */
const QuestionReports = (function () {
  /** よくある指摘（複数選択可）。label は送信・管理画面表示用 */
  const REASON_OPTIONS = [
    { id: "wrong_content", label: "正解・解説の内容が誤り／曖昧" },
    { id: "change_format", label: "問題の出し方・形式を変えた方がよい" },
    { id: "prefer_multi", label: "複数選択形式にした方がよい" },
    { id: "choice_quality", label: "選択肢が簡単すぎる" },
    { id: "awkward_japanese", label: "問題文・選択肢の日本語がおかしい／分かりにくい" },
    { id: "more_explanation", label: "解説をもっと詳しくしてほしい" },
    { id: "more_example", label: "具体例をもうちょっと教えてほしい" },
    { id: "need_purpose", label: "操作・設定の目的（なぜやるか）を知りたい" },
    { id: "other", label: "その他（下に補足を書いてください）" },
  ];

  function firebaseReady() {
    return typeof FirebaseApp !== "undefined" ? FirebaseApp.ready() : false;
  }

  function getDb() {
    return typeof FirebaseApp !== "undefined" ? FirebaseApp.getDb() : null;
  }

  function isAvailable() {
    return !!getDb();
  }

  function reasonLabel(id) {
    const hit = REASON_OPTIONS.find((r) => r.id === id);
    return hit ? hit.label : id;
  }

  function renderReasonOptions(container) {
    if (!container) return;
    container.innerHTML = REASON_OPTIONS.map(
      (r) =>
        `<label class="report-reason-item">` +
        `<input type="checkbox" name="report-reason" value="${r.id}" />` +
        `<span>${r.label}</span>` +
        `</label>`
    ).join("");
  }

  function selectedReasonIds(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[name="report-reason"]:checked')).map(
      (el) => el.value
    );
  }

  function clearReasonOptions(container) {
    if (!container) return;
    container.querySelectorAll('input[name="report-reason"]').forEach((el) => {
      el.checked = false;
      el.disabled = false;
    });
  }

  function disableReasonOptions(container, disabled) {
    if (!container) return;
    container.querySelectorAll('input[name="report-reason"]').forEach((el) => {
      el.disabled = disabled;
    });
  }

  async function submit(report) {
    const db = getDb();
    if (!db) throw new Error("Firebase が未設定のため送信できません。");

    const reasonIds = Array.isArray(report.reasonIds)
      ? report.reasonIds.filter((id) => REASON_OPTIONS.some((r) => r.id === id))
      : [];
    const reasonLabels = reasonIds.map(reasonLabel);
    const note = (report.message || "").trim();

    if (reasonIds.length === 0 && note.length < 5) {
      throw new Error("指摘の種類を選ぶか、補足を5文字以上書いてください。");
    }
    if (reasonIds.includes("other") && note.length < 5) {
      throw new Error("「その他」を選んだときは補足を5文字以上書いてください。");
    }
    if (note.length > 2000) throw new Error("補足は2000文字以内にしてください。");

    const messageParts = [];
    if (reasonLabels.length) messageParts.push(reasonLabels.join(" / "));
    if (note) messageParts.push(note);
    const message = messageParts.join("\n");

    let userEmail = null;
    let userId = null;
    if (firebase.auth && firebase.auth().currentUser) {
      const user = firebase.auth().currentUser;
      userEmail = user.email || null;
      userId = user.uid;
    }

    const doc = {
      questionId: String(report.questionId || ""),
      subjectId: String(report.subjectId || ""),
      subjectTitle: String(report.subjectTitle || ""),
      questionCategory: String(report.questionCategory || ""),
      questionModule: String(report.questionModule || ""),
      questionCode: String(report.questionCode || ""),
      questionText: String(report.questionText || "").slice(0, 500),
      registeredAnswer: String(report.registeredAnswer || "").slice(0, 500),
      userAnswer: String(report.userAnswer || "").slice(0, 500),
      wasCorrect: !!report.wasCorrect,
      reasonIds,
      reasonLabels,
      message,
      note,
      appVersion: typeof APP_VERSION !== "undefined" ? APP_VERSION : "",
      userEmail,
      userId,
      status: "open",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (!doc.questionId) throw new Error("問題IDがありません。");

    await db.collection("questionReports").add(doc);
    return true;
  }

  return {
    REASON_OPTIONS,
    isAvailable,
    submit,
    renderReasonOptions,
    selectedReasonIds,
    clearReasonOptions,
    disableReasonOptions,
    reasonLabel,
  };
})();
