/**
 * questionStats のパス解決（科目別サブコレクション + レガシー互換）
 *
 * 新: questionStats/{subjectId}/questions/{questionId}
 * 旧: questionStats/{questionId}  （読み取りのみフォールバック）
 */
const QuestionStatsPaths = (function () {
  const SUBJECT_IDS = [
    "sap",
    "windows-shortcuts",
    "biz-career",
    "excel-functions",
    "outlook-mail",
    "teams-collab",
    "ai-ontology-intro",
    "ai-ontology-core",
  ];

  function guessSubjectId(questionId, hint) {
    if (hint) return String(hint);
    const id = String(questionId || "");
    if (id.startsWith("ws-")) return "windows-shortcuts";
    if (id.startsWith("bc-")) return "biz-career";
    if (id.startsWith("ef-")) return "excel-functions";
    if (id.startsWith("om-")) return "outlook-mail";
    if (id.startsWith("tc-")) return "teams-collab";
    if (id.startsWith("aoi-")) return "ai-ontology-intro";
    if (id.startsWith("ao-")) return "ai-ontology-core";
    return "sap";
  }

  function isSubjectDocId(id) {
    return SUBJECT_IDS.includes(id);
  }

  function docRef(db, questionId, subjectId) {
    const sid = guessSubjectId(questionId, subjectId);
    return db
      .collection("questionStats")
      .doc(sid)
      .collection("questions")
      .doc(String(questionId));
  }

  function legacyDocRef(db, questionId) {
    return db.collection("questionStats").doc(String(questionId));
  }

  return {
    SUBJECT_IDS,
    guessSubjectId,
    isSubjectDocId,
    docRef,
    legacyDocRef,
  };
})();
