/**
 * questionStats のパス解決（科目別サブコレクション + レガシー互換）
 *
 * 新: questionStats/{subjectId}/questions/{questionId}
 * 旧: questionStats/{questionId}  （読み取りのみフォールバック）
 *
 * 科目の一覧と接頭の表は functions/question-stats-paths.js と同じ中身にする。
 * ずれていないことは functions/__tests__/question-stats-subject-wiring.test.js
 * が見張っている。
 */
const QuestionStatsPaths = (function () {
  // このモジュールは app.js から遅延で読み込まれる。index.html と
  // admin/question-analytics.html のどちらも subjects/registry.js を先に
  // 読むので、ここに来た時点で SUBJECT_REGISTRY は在る。
  // 以前は8件を手で並べていて、biz-pm-planning と biz-pm-operation が
  // レジストリに入った時点から欠けていた (2026-10-26 実測)。
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
    if (typeof SUBJECT_REGISTRY !== "undefined" && Array.isArray(SUBJECT_REGISTRY)) {
      const ids = SUBJECT_REGISTRY.filter(function (s) {
        return s && s.id && s.enabled !== false;
      }).map(function (s) {
        return s.id;
      });
      if (ids.length) return ids;
    }
    return FALLBACK_SUBJECT_IDS.slice();
  }

  const SUBJECT_IDS = listSubjectIds();

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

  return {
    SUBJECT_IDS,
    FALLBACK_SUBJECT_IDS,
    ID_PREFIXES,
    DEFAULT_SUBJECT_ID,
    guessSubjectId,
    isSubjectDocId,
    docRef,
    legacyDocRef,
  };
})();
