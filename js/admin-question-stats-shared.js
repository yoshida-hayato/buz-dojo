/**
 * 管理者向け questionStats 集計の共有ロジック
 */
window.AdminQuestionStatsShared = (function () {
  function subjectTitle(id) {
    if (!id) return "（科目なし）";
    if (typeof SUBJECT_REGISTRY !== "undefined") {
      const hit = SUBJECT_REGISTRY.find((s) => s.id === id);
      if (hit) return hit.shortTitle || hit.title || id;
    }
    return id;
  }

  function guessSubjectId(questionId, subjectIdFromStat) {
    if (subjectIdFromStat) return subjectIdFromStat;
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

  function entryQuestionText(e) {
    if (!e) return "";
    if (e.category === "judgment" && e.name) return e.name;
    if (e.name) return e.name;
    return e.code || e.id || "";
  }

  function entryAnswerText(e) {
    if (!e) return "";
    if (e.category === "judgment") {
      if (Array.isArray(e.statements)) {
        return e.statements
          .map((s) => (s && s.correct ? "正" : "誤") + ":" + (s.text || ""))
          .join(" / ");
      }
      if (Array.isArray(e.choices) && e.choices.length) return String(e.choices[0]);
      return e.answer != null ? String(e.answer) : "—";
    }
    if (e.code && e.name) return e.code + " — " + e.name;
    if (e.code) return String(e.code);
    if (e.name) return String(e.name);
    return "—";
  }

  async function fetchAllQuestionStats(db) {
    const subjects =
      typeof SUBJECT_REGISTRY !== "undefined"
        ? SUBJECT_REGISTRY.filter((s) => s.enabled !== false).map((s) => s.id)
        : ["sap", "windows-shortcuts", "biz-career"];
    const docs = [];
    const seen = new Set();

    await Promise.all(
      subjects.map(async (sid) => {
        const snap = await db
          .collection("questionStats")
          .doc(sid)
          .collection("questions")
          .get();
        snap.forEach((doc) => {
          seen.add(doc.id);
          docs.push({ id: doc.id, data: doc.data() || {} });
        });
      })
    );

    const legacySnap = await db.collection("questionStats").get();
    legacySnap.forEach((doc) => {
      if (seen.has(doc.id)) return;
      if (subjects.includes(doc.id)) return;
      const d = doc.data() || {};
      if (
        d.attempts !== undefined ||
        d.correct !== undefined ||
        d.inputAttempts !== undefined ||
        d.inputCorrect !== undefined
      ) {
        docs.push({ id: doc.id, data: d });
      }
    });

    return docs;
  }

  async function buildQuestionMetaMap() {
    const map = new Map();
    const subjects =
      typeof SUBJECT_REGISTRY !== "undefined"
        ? SUBJECT_REGISTRY.filter((s) => s.enabled !== false)
        : [];

    await Promise.all(
      subjects.map(async (s) => {
        const base = (s.contentBase || "").replace(/\/$/, "");
        if (!base) return;
        async function fetchText(path) {
          const res = await fetch(path + "?_=" + Date.now(), {
            cache: "no-store",
            mode: "cors",
          });
          if (!res.ok) throw new Error("fetch failed");
          return res.text();
        }
        let jSrc = "var JUDGMENT_DATA = [];";
        try {
          jSrc = await fetchText(base + "/judgment-questions.js");
        } catch (_) {
          /* optional */
        }
        try {
          const qSrc = await fetchText(base + "/questions.js");
          const quiz = new Function(
            jSrc +
              "\n" +
              qSrc +
              "\n;return typeof QUIZ_DATA!=='undefined'?QUIZ_DATA:[];"
          )();
          (quiz || []).forEach((e) => {
            if (!e || !e.id) return;
            map.set(e.id, {
              subjectId: s.id,
              text: entryQuestionText(e),
              answer: entryAnswerText(e),
              hasInput: !!(e.inputAnswer || e.inputAnswers),
            });
          });
        } catch (err) {
          console.warn("問題マスタ読込失敗:", s.id, err);
        }
      })
    );
    return map;
  }

  /**
   * stats ドキュメントを問題行に展開（選択式・記述式それぞれ1行）
   */
  function buildQuestionRows(statsDocs, metaMap) {
    const rows = [];
    statsDocs.forEach((item) => {
      const d = item.data || {};
      const questionId = item.id;
      const meta = metaMap.get(questionId) || {};
      const subjectId = guessSubjectId(questionId, d.subjectId || meta.subjectId || "");
      const subjectLabel = subjectTitle(subjectId);
      const text = meta.text || "（マスタ未取得）";
      const answer = meta.answer || "—";

      const attempts = Number(d.attempts) || 0;
      const correct = Number(d.correct) || 0;
      if (attempts > 0) {
        rows.push({
          id: questionId,
          subjectId,
          subjectLabel,
          mode: "選択",
          modeKey: "choice",
          attempts,
          correct,
          pct: Math.round((correct / attempts) * 100),
          text,
          answer,
        });
      }

      const inputAttempts = Number(d.inputAttempts) || 0;
      const inputCorrect = Number(d.inputCorrect) || 0;
      if (inputAttempts > 0) {
        rows.push({
          id: questionId,
          subjectId,
          subjectLabel,
          mode: "記述",
          modeKey: "input",
          attempts: inputAttempts,
          correct: inputCorrect,
          pct: Math.round((inputCorrect / inputAttempts) * 100),
          text,
          answer,
        });
      }
    });
    return rows;
  }

  const RATE_BUCKETS = [
    { id: "zero", label: "0%", color: "#c0392b", min: 0, max: 0 },
    { id: "vlow", label: "1〜25%", color: "#e67e22", min: 1, max: 25 },
    { id: "low", label: "26〜50%", color: "#f1c40f", min: 26, max: 50 },
    { id: "mid", label: "51〜75%", color: "#52be80", min: 51, max: 75 },
    { id: "high", label: "76〜99%", color: "#27ae60", min: 76, max: 99 },
    { id: "perfect", label: "100%", color: "#1e8449", min: 100, max: 100 },
  ];

  function bucketForPct(pct) {
    for (const b of RATE_BUCKETS) {
      if (pct >= b.min && pct <= b.max) return b;
    }
    return RATE_BUCKETS[0];
  }

  function computeDistribution(rows, minAttempts) {
    const eligible = rows.filter((r) => r.attempts >= minAttempts);
    const counts = {};
    RATE_BUCKETS.forEach((b) => {
      counts[b.id] = 0;
    });
    eligible.forEach((r) => {
      const b = bucketForPct(r.pct);
      counts[b.id] += 1;
    });
    const zeroCount = counts.zero || 0;
    return {
      eligible,
      counts,
      total: eligible.length,
      zeroCount,
      zeroPct: eligible.length ? Math.round((zeroCount / eligible.length) * 1000) / 10 : 0,
      buckets: RATE_BUCKETS,
    };
  }

  function computeCatalogStats(metaMap, rows, modeKey, subjectId) {
    let catalogTotal = 0;
    metaMap.forEach((meta, id) => {
      if (subjectId !== "all" && meta.subjectId !== subjectId) return;
      if (modeKey === "input" && !meta.hasInput) return;
      catalogTotal += 1;
    });

    const filteredRows = rows.filter((r) => {
      if (subjectId !== "all" && r.subjectId !== subjectId) return false;
      if (modeKey === "choice" && r.modeKey !== "choice") return false;
      if (modeKey === "input" && r.modeKey !== "input") return false;
      return true;
    });

    const withAny = filteredRows.filter((r) => r.attempts >= 1).length;
    const withMin5 = filteredRows.filter((r) => r.attempts >= 5).length;

    return {
      catalogTotal,
      withAny,
      withMin5,
      coverageAnyPct: catalogTotal
        ? Math.round((withAny / catalogTotal) * 1000) / 10
        : 0,
    };
  }

  function computeSubjectSummary(rows, minAttempts, modeKey) {
    const bySubject = new Map();
    rows.forEach((r) => {
      if (modeKey !== "all" && r.modeKey !== modeKey) return;
      if (r.attempts < minAttempts) return;
      if (!bySubject.has(r.subjectId)) {
        bySubject.set(r.subjectId, {
          subjectId: r.subjectId,
          subjectLabel: r.subjectLabel,
          count: 0,
          sumPct: 0,
          zeroCount: 0,
          attempts: 0,
        });
      }
      const s = bySubject.get(r.subjectId);
      s.count += 1;
      s.sumPct += r.pct;
      s.attempts += r.attempts;
      if (r.pct === 0) s.zeroCount += 1;
    });
    return Array.from(bySubject.values())
      .map((s) => ({
        ...s,
        avgPct: s.count ? Math.round(s.sumPct / s.count) : 0,
        zeroPct: s.count ? Math.round((s.zeroCount / s.count) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.avgPct - b.avgPct);
  }

  return {
    subjectTitle,
    guessSubjectId,
    fetchAllQuestionStats,
    buildQuestionMetaMap,
    buildQuestionRows,
    computeDistribution,
    computeCatalogStats,
    computeSubjectSummary,
    RATE_BUCKETS,
    bucketForPct,
  };
})();
