/**
 * SAP道場 / 学習道場（問題マスタ・開発側）の成績をビジネス道場へ取り込む
 *
 * マスタ側で貯めた個人成績を本番（ビジネス道場）へ持ち込むための橋渡し。
 * 一度きりの使い捨てではなく、同じメールでログインしたときに引き継げるようにする。
 *
 * ローカル（同一ブラウザ）:
 * - sap_tcode_dojo_stats_v1 → biz_dojo_sap_stats_v1
 * - study_dojo_biz_career_stats_v1 → biz_dojo_biz_career_stats_v1
 * - study_dojo_windows_shortcuts_stats_v1 → biz_dojo_windows_shortcuts_stats_v1
 *
 * クラウド（ログイン時）:
 * - Cloud Function importLegacyDojoStats（メールで sap-dojo / gakusyu-dojo を照合）
 */
const LegacyStatsImport = (function () {
  const LOCAL_MAPPINGS = [
    {
      subjectId: "sap",
      fromKey: "sap_tcode_dojo_stats_v1",
      toKey: "biz_dojo_sap_stats_v1",
      source: "sap-dojo",
    },
    {
      subjectId: "biz-career",
      fromKey: "study_dojo_biz_career_stats_v1",
      toKey: "biz_dojo_biz_career_stats_v1",
      source: "gakusyu-dojo",
    },
    {
      subjectId: "windows-shortcuts",
      fromKey: "study_dojo_windows_shortcuts_stats_v1",
      toKey: "biz_dojo_windows_shortcuts_stats_v1",
      source: "gakusyu-dojo",
    },
  ];

  let cloudImportInFlight = null;

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

  function mergeDaily(d1, d2) {
    const out = { ...(d1 || {}) };
    for (const [k, v] of Object.entries(d2 || {})) {
      if (!out[k]) out[k] = { a: v.a || 0, c: v.c || 0 };
      else {
        out[k] = {
          a: Math.max(out[k].a || 0, v.a || 0),
          c: Math.max(out[k].c || 0, v.c || 0),
        };
      }
    }
    return out;
  }

  function normalizeRaw(data) {
    if (typeof QuizStorage !== "undefined" && QuizStorage._normalize) {
      return QuizStorage._normalize(data || {});
    }
    return data || {};
  }

  function mergeStats(a, b) {
    const left = normalizeRaw(a);
    const right = normalizeRaw(b);
    if ((right.answered || 0) === 0) return left;
    if ((left.answered || 0) === 0) return right;

    const merged = {
      answered: 0,
      correct: 0,
      inputAnswered: 0,
      inputCorrect: 0,
      choiceLog: [],
      inputLog: [],
      q: { ...(left.q || {}) },
      daily: mergeDaily(left.daily, right.daily),
    };

    for (const [id, s2] of Object.entries(right.q || {})) {
      const s1 = merged.q[id];
      merged.q[id] = s1 ? mergeQuestionStat(s1, s2) : { ...s2 };
    }

  merged.answered = Math.max(left.answered || 0, right.answered || 0);
  merged.correct = Math.max(left.correct || 0, right.correct || 0);
  merged.inputAnswered = Math.max(left.inputAnswered || 0, right.inputAnswered || 0);
  merged.inputCorrect = Math.max(left.inputCorrect || 0, right.inputCorrect || 0);

  merged.choiceLog =
    (left.choiceLog || []).length >= (right.choiceLog || []).length
      ? (left.choiceLog || []).slice()
      : (right.choiceLog || []).slice();
  merged.inputLog =
    (left.inputLog || []).length >= (right.inputLog || []).length
      ? (left.inputLog || []).slice()
      : (right.inputLog || []).slice();

  return merged;
}

  function statsChanged(before, after) {
    if ((after.answered || 0) > (before.answered || 0)) return true;
    if ((after.correct || 0) > (before.correct || 0)) return true;
    if ((after.choiceLog || []).length > (before.choiceLog || []).length) return true;
    if ((after.inputLog || []).length > (before.inputLog || []).length) return true;
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

  function readLocalKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return normalizeRaw(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  /** 1科目分のローカルマージ。変更があれば true */
  function importLocalMapping(mapping) {
    const legacy = readLocalKey(mapping.fromKey);
    if (!legacy || (legacy.answered || 0) === 0) return false;

    const current =
      typeof QuizStorage !== "undefined" && QuizStorage._loadFromKey
        ? QuizStorage._loadFromKey(mapping.toKey)
        : normalizeRaw(null);
    const base = current || normalizeRaw(null);
    const merged = mergeStats(base, legacy);
    if (!statsChanged(base, merged)) return false;

    try {
      localStorage.setItem(mapping.toKey, JSON.stringify(merged));
    } catch (e) {
      console.warn("過去成績のローカル保存に失敗:", mapping.fromKey, e);
      return false;
    }
    return true;
  }

  /** 全ローカルマッピングを実行。変更された科目 ID の配列を返す */
  function importLocalLegacy(subjectIdFilter) {
    const changed = [];
    for (const m of LOCAL_MAPPINGS) {
      if (subjectIdFilter && m.subjectId !== subjectIdFilter) continue;
      if (importLocalMapping(m)) changed.push(m.subjectId);
    }
    return changed;
  }

  async function importCloudLegacy(options = {}) {
    if (
      typeof firebase === "undefined" ||
      !firebase.functions ||
      typeof FIREBASE_CONFIG === "undefined" ||
      !FIREBASE_CONFIG.projectId
    ) {
      return { imported: false, reason: "no_functions" };
    }

    const FORCE_KEY = "biz_dojo_legacy_force_v2";
    let force = !!options.force;
    try {
      if (!force && localStorage.getItem(FORCE_KEY) !== "1") force = true;
    } catch (e) {
      /* ignore */
    }

    if (!cloudImportInFlight) {
      cloudImportInFlight = firebase
        .app()
        .functions("asia-northeast1")
        .httpsCallable("importLegacyDojoStats")({ force })
        .then((res) => {
          try {
            localStorage.setItem(FORCE_KEY, "1");
          } catch (e) {
            /* ignore */
          }
          return res && res.data ? res.data : res;
        })
        .catch((err) => {
          console.warn("過去アプリのクラウド成績取り込み:", err);
          return { imported: false, reason: "error", message: err.message };
        })
        .finally(() => {
          cloudImportInFlight = null;
        });
    }
    return cloudImportInFlight;
  }

  async function reloadActiveSubjectIfNeeded(subjectIds) {
    if (typeof QuizStorage === "undefined") return;
    if (!subjectIds || subjectIds.length === 0) return;
    if (!subjectIds.includes(QuizStorage.subjectId)) return;

    const mapping = LOCAL_MAPPINGS.find((m) => m.subjectId === QuizStorage.subjectId);
    if (QuizStorage.mode === "cloud" && QuizStorage.uid && QuizStorage.db) {
      await QuizStorage._cloudLoad();
    } else if (mapping) {
      QuizStorage.stats = QuizStorage._loadFromKey(mapping.toKey);
    }
  }

  function cloudChangedSubjectIds(result) {
    const ids = [];
    if (result && result.sap && (result.sap.imported || (result.sap.qSize || 0) > 0)) {
      if (result.sap.imported) ids.push("sap");
    }
    if (result && result.gakusyu && result.gakusyu.subjects) {
      for (const [sid, r] of Object.entries(result.gakusyu.subjects)) {
        if (r && r.imported) ids.push(sid);
      }
    }
    // 後方互換（旧 importSapDojoStats 単体レスポンス）
    if (result && result.imported && result.subjectId) ids.push(result.subjectId);
    if (result && result.imported && !result.sap && !result.gakusyu && !result.subjectId) {
      ids.push("sap");
    }
    return ids;
  }

  /**
   * @param {{ user?: object, tryCloud?: boolean, subjectId?: string }} options
   * @returns {Promise<boolean>}
   */
  async function run(options = {}) {
    const localChanged = importLocalLegacy(options.subjectId || null);
    let cloudIds = [];

    const user =
      options.user ||
      (typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser);

    if (user && options.tryCloud !== false) {
      const result = await importCloudLegacy({ force: !!options.force });
      cloudIds = cloudChangedSubjectIds(result);
      if (result && result.gakusyu) {
        console.info("学習道場取り込み結果:", result.gakusyu);
      }
      if (result && result.imported) {
        await reloadActiveSubjectIfNeeded(cloudIds);
      }
    }

    if (localChanged.length) {
      await reloadActiveSubjectIfNeeded(localChanged);
    }

    return localChanged.length > 0 || cloudIds.length > 0;
  }

  async function runAfterLogin(user) {
    return run({ user, tryCloud: true });
  }

  return {
    LOCAL_MAPPINGS,
    mergeStats,
    importLocalLegacy,
    run,
    runAfterLogin,
  };
})();

/** 旧名互換 */
const SapLegacyImport = LegacyStatsImport;