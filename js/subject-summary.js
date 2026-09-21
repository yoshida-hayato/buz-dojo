/**
 * 科目成績サマリ（users/{uid}/subjects/{subjectId} の軽量フィールド）
 * 詳細（q / log）は subjects/{subjectId}/detail/stats に分離。
 */
const SubjectSummary = (function () {
  const LOCAL_CACHE_KEY = "biz_dojo_subject_summary_v1";

  function empty() {
    return {
      answered: 0,
      correct: 0,
      inputAnswered: 0,
      inputCorrect: 0,
      masteredChoice: 0,
      masteredInput: 0,
      rankName: "",
      rankAlias: "",
      rankColor: "",
      rankFg: "",
      choiceAccPct: 0,
      daily: {},
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

  function normalize(raw) {
    const base = empty();
    if (!raw || typeof raw !== "object") return base;
    return {
      answered: Number(raw.answered) || 0,
      correct: Number(raw.correct) || 0,
      inputAnswered: Number(raw.inputAnswered) || 0,
      inputCorrect: Number(raw.inputCorrect) || 0,
      masteredChoice: Number(raw.masteredChoice) || 0,
      masteredInput: Number(raw.masteredInput) || 0,
      rankName: String(raw.rankName || ""),
      rankAlias: String(raw.rankAlias || ""),
      rankColor: String(raw.rankColor || ""),
      rankFg: String(raw.rankFg || ""),
      choiceAccPct: Number(raw.choiceAccPct) || 0,
      daily: normalizeDaily(raw.daily),
    };
  }

  function fromStats(stats) {
    if (!stats) return empty();
    return normalize({
      answered: stats.answered,
      correct: stats.correct,
      inputAnswered: stats.inputAnswered,
      inputCorrect: stats.inputCorrect,
      masteredChoice: stats.masteredChoice,
      masteredInput: stats.masteredInput,
      rankName: stats.rankName,
      rankAlias: stats.rankAlias,
      rankColor: stats.rankColor,
      rankFg: stats.rankFg,
      choiceAccPct: stats.choiceAccPct,
      daily: stats.daily,
    });
  }

  function rankFrom(summary) {
    const s = normalize(summary);
    if (!s.rankName) return null;
    return {
      name: s.rankName,
      alias: s.rankAlias,
      color: s.rankColor,
      fg: s.rankFg,
    };
  }

  function readLocalMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function setLocal(subjectId, summary) {
    try {
      const map = readLocalMap();
      map[subjectId] = normalize(summary);
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(map));
    } catch (e) {
      /* ignore */
    }
  }

  function getLocal(subjectId) {
    const map = readLocalMap();
    return normalize(map[subjectId]);
  }

  function clearAllLocal() {
    try {
      localStorage.removeItem(LOCAL_CACHE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  return {
    LOCAL_CACHE_KEY,
    empty,
    normalize,
    fromStats,
    rankFrom,
    readLocalMap,
    setLocal,
    getLocal,
    clearAllLocal,
  };
})();
