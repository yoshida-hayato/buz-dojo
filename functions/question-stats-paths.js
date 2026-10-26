/** questionStats パス（クライアント js/question-stats-paths.js と同期） */
const pricing = require("./pricing-shared.js");

// 科目の一覧は料金の正本から導く。config/pricing.js に科目を足せば
// _dev/sync-shared.py が pricing-shared.js を同期するので、ここは
// 科目が増えても手で直さなくてよい。
// 以前はここに8件を手で並べていて、biz-pm-planning と biz-pm-operation が
// レジストリに入った時点から欠けていた (2026-10-26 実測)。欠けると
// listAllQuestionStatsBuz がその科目のサブコレクションを一度も読まない。
const FALLBACK_SUBJECT_IDS = [
  "sap",
  "windows-shortcuts",
  "biz-career",
  "biz-pm-planning",
  "biz-pm-operation",
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

module.exports = {
  SUBJECT_IDS,
  guessSubjectId,
  isSubjectDocId,
  docRef,
  legacyDocRef,
};
