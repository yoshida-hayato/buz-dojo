/**
 * マスタ側 catalog.js から問題数を取得（軽量・キャッシュ付き）
 */
const SubjectCatalog = (function () {
  const CACHE_KEY = "biz_dojo_subject_catalog_v1";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  let memory = null;
  let inflight = null;

  function findMeta(id) {
    return (typeof SUBJECT_REGISTRY !== "undefined" ? SUBJECT_REGISTRY : []).find((s) => s.id === id);
  }

  function resolveContentBase(meta) {
    if (!meta) return "";
    try {
      if (new URLSearchParams(location.search).get("contentLocal") === "1") {
        return meta.path.replace(/\/$/, "");
      }
    } catch (e) {
      /* ignore */
    }
    return (meta.contentBase || meta.path || "").replace(/\/$/, "");
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.counts) return null;
      if (Date.now() - (parsed.at || 0) > CACHE_TTL_MS) return null;
      return parsed.counts;
    } catch (e) {
      return null;
    }
  }

  function writeCache(counts) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), counts })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function fallbackCount(subjectId) {
    if (typeof PricingConfig !== "undefined" && PricingConfig.SUBJECT_CATALOG) {
      const meta = PricingConfig.SUBJECT_CATALOG[subjectId];
      if (meta && Number(meta.questionCount) > 0) return Number(meta.questionCount);
    }
    const reg = findMeta(subjectId);
    if (reg && Number(reg.questionCount) > 0) return Number(reg.questionCount);
    return 0;
  }

  async function fetchOne(subjectId) {
    const meta = findMeta(subjectId);
    if (!meta) return fallbackCount(subjectId);
    const base = resolveContentBase(meta);
    if (!base) return fallbackCount(subjectId);
    const url = base + "/catalog.js?_=" + Date.now();
    try {
      const res = await fetch(url, { cache: "no-store", mode: "cors" });
      if (!res.ok) throw new Error("catalog fetch failed");
      const text = await res.text();
      const count = new Function(
        text + "\n;return typeof SUBJECT_CONTENT_CATALOG!=='undefined'?SUBJECT_CONTENT_CATALOG:null;"
      )();
      const n = Number(count && count.questionCount);
      return n > 0 ? n : fallbackCount(subjectId);
    } catch (e) {
      console.warn("catalog.js の取得に失敗:", subjectId, e);
      return fallbackCount(subjectId);
    }
  }

  async function loadAll() {
    if (memory) return memory;
    const cached = readCache();
    if (cached) {
      memory = cached;
      return memory;
    }
    if (inflight) return inflight;

    const subjects =
      typeof SUBJECT_REGISTRY !== "undefined"
        ? SUBJECT_REGISTRY.filter((s) => s.enabled !== false)
        : [];

    inflight = Promise.all(
      subjects.map(async (s) => {
        const count = await fetchOne(s.id);
        return [s.id, count];
      })
    )
      .then((pairs) => {
        const counts = {};
        for (const [id, n] of pairs) counts[id] = n;
        memory = counts;
        writeCache(counts);
        inflight = null;
        return counts;
      })
      .catch((e) => {
        inflight = null;
        throw e;
      });

    return inflight;
  }

  async function getQuestionCount(subjectId) {
    const all = await loadAll();
    if (all && typeof all[subjectId] === "number") return all[subjectId];
    return fallbackCount(subjectId);
  }

  function getQuestionCountSync(subjectId) {
    if (memory && typeof memory[subjectId] === "number") return memory[subjectId];
    const cached = readCache();
    if (cached && typeof cached[subjectId] === "number") return cached[subjectId];
    return fallbackCount(subjectId);
  }

  function invalidate() {
    memory = null;
    inflight = null;
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  return {
    loadAll,
    getQuestionCount,
    getQuestionCountSync,
    invalidate,
  };
})();
