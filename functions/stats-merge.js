/**
 * 成績オブジェクトのマージ（SAP道場 → ビジネス道場 SAP科目）
 * クライアント js/sap-legacy-import.js と同じ方針
 */

function emptyStats() {
  return {
    answered: 0,
    correct: 0,
    inputAnswered: 0,
    inputCorrect: 0,
    choiceLog: [],
    inputLog: [],
    q: {},
    daily: {},
  };
}

function mergeQuestionStat(s1, s2) {
  return {
    a: Math.max(s1.a || 0, s2.a || 0),
    c: Math.max(s1.c || 0, s2.c || 0),
    k: Math.max(s1.k || 0, s2.k || 0),
    ck: Math.max(s1.ck || 0, s2.ck || 0),
    ia: Math.max(s1.ia || 0, s2.ia || 0),
    ic: Math.max(s1.ic || 0, s2.ic || 0),
    ik: Math.max(s1.ik || 0, s2.ik || 0),
  };
}

function normalizeDaily(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const a = Number(v && v.a) || 0;
    const c = Number(v && v.c) || 0;
    if (a > 0) out[k] = { a, c };
  }
  return out;
}

function normalizeStats(data) {
  if (!data || typeof data !== "object") return emptyStats();
  const log = Array.isArray(data.choiceLog) ? data.choiceLog.map((v) => (v ? 1 : 0)) : [];
  const inputLog = Array.isArray(data.inputLog) ? data.inputLog.map((v) => (v ? 1 : 0)) : [];
  const q = {};
  const rawQ = data.q || {};
  for (const [id, s] of Object.entries(rawQ)) {
    const row = { ...(s || {}) };
    if (typeof row.ck !== "number") {
      row.ck = row.ia > 0 ? 0 : row.k || 0;
    }
    q[id] = row;
  }
  return {
    answered: Number(data.answered) || 0,
    correct: Number(data.correct) || 0,
    inputAnswered: Number(data.inputAnswered) || 0,
    inputCorrect: Number(data.inputCorrect) || 0,
    choiceLog: log,
    inputLog,
    q,
    daily: normalizeDaily(data.daily),
  };
}

function mergeDaily(d1, d2) {
  const out = { ...(d1 || {}) };
  for (const [k, v] of Object.entries(d2 || {})) {
    if (!out[k]) {
      out[k] = { a: v.a || 0, c: v.c || 0 };
    } else {
      out[k] = {
        a: Math.max(out[k].a || 0, v.a || 0),
        c: Math.max(out[k].c || 0, v.c || 0),
      };
    }
  }
  return out;
}

function mergeStats(a, b) {
  const left = normalizeStats(a);
  const right = normalizeStats(b);
  if (right.answered === 0) return left;
  if (left.answered === 0) return right;

  const merged = {
    answered: 0,
    correct: 0,
    inputAnswered: 0,
    inputCorrect: 0,
    choiceLog: [],
    inputLog: [],
    q: { ...left.q },
    daily: mergeDaily(left.daily, right.daily),
  };

  for (const [id, s2] of Object.entries(right.q)) {
    const s1 = merged.q[id];
    merged.q[id] = s1 ? mergeQuestionStat(s1, s2) : { ...s2 };
  }

  merged.answered = Math.max(left.answered, right.answered);
  merged.correct = Math.max(left.correct, right.correct);
  merged.inputAnswered = Math.max(left.inputAnswered, right.inputAnswered);
  merged.inputCorrect = Math.max(left.inputCorrect, right.inputCorrect);

  const primary = left.answered >= right.answered ? left : right;
  const secondary = primary === left ? right : left;
  merged.choiceLog =
    (primary.choiceLog || []).length >= (secondary.choiceLog || []).length
      ? (primary.choiceLog || []).slice()
      : (secondary.choiceLog || []).slice();
  merged.inputLog =
    (primary.inputLog || []).length >= (secondary.inputLog || []).length
      ? (primary.inputLog || []).slice()
      : (secondary.inputLog || []).slice();

  return merged;
}

function statsChanged(before, after) {
  if ((after.answered || 0) > (before.answered || 0)) return true;
  if ((after.correct || 0) > (before.correct || 0)) return true;
  const beforeQ = before.q || {};
  const afterQ = after.q || {};
  for (const id of Object.keys(afterQ)) {
    if (!beforeQ[id]) return true;
    const b = beforeQ[id];
    const a = afterQ[id];
    if ((a.a || 0) > (b.a || 0) || (a.ck || 0) > (b.ck || 0) || (a.ik || 0) > (b.ik || 0)) {
      return true;
    }
  }
  return false;
}

function buildSubjectPayload(stats, subjectId, email) {
  return {
    answered: stats.answered,
    correct: stats.correct,
    inputAnswered: stats.inputAnswered || 0,
    inputCorrect: stats.inputCorrect || 0,
    choiceLog: stats.choiceLog || [],
    inputLog: stats.inputLog || [],
    q: stats.q || {},
    daily: stats.daily || {},
    subjectId,
    email: email || null,
  };
}

module.exports = {
  emptyStats,
  normalizeStats,
  mergeStats,
  statsChanged,
  buildSubjectPayload,
};
