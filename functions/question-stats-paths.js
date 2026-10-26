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

function listSubjectIds() {
  const catalog = pricing && pricing.SUBJECT_CATALOG;
  const ids = catalog ? Object.keys(catalog) : [];
  return ids.length ? ids : FALLBACK_SUBJECT_IDS.slice();
}

const SUBJECT_IDS = listSubjectIds();

// 問題 id の接頭から科目を当てる。hint (科目の明示) が無いときだけ効く。
// 並び順そのものが仕様である: 生産管理の問題は bc-sc-、プランニング専門は
// bc-pp-、オペレーション専門は bc-po- で、3つとも bc- で始まる
// (2026-10-26 にマスタの questions.js で実測)。だから長いほうを bc- より
// 先に置く。順を逆にすると専門2科目が生産管理に吸い込まれる。
const ID_PREFIXES = [
  ["bc-pp-", "biz-pm-planning"],
  ["bc-po-", "biz-pm-operation"],
  ["ws-", "windows-shortcuts"],
  ["bc-", "biz-career"],
  ["ef-", "excel-functions"],
  ["om-", "outlook-mail"],
  ["tc-", "teams-collab"],
  ["aoi-", "ai-ontology-intro"],
  ["ao-", "ai-ontology-core"],
];

const DEFAULT_SUBJECT_ID = "sap";

function guessSubjectId(questionId, hint) {
  if (hint) return String(hint);
  const id = String(questionId || "");
  for (let i = 0; i < ID_PREFIXES.length; i++) {
    if (id.startsWith(ID_PREFIXES[i][0])) return ID_PREFIXES[i][1];
  }
  return DEFAULT_SUBJECT_ID;
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
  FALLBACK_SUBJECT_IDS,
  ID_PREFIXES,
  DEFAULT_SUBJECT_ID,
  guessSubjectId,
  isSubjectDocId,
  docRef,
  legacyDocRef,
};
