/**
 * 管理者：正答率分析（admin/question-analytics.html）
 */
(function () {
  const $ = (id) => document.getElementById(id);

  let allRows = [];
  let metaMap = new Map();
  let tableLimit = 50;

  function shared() {
    const api = window.AdminQuestionStatsShared;
    if (!api) throw new Error("集計モジュールが読み込まれていません");
    return api;
  }

  function showGate(text) {
    $("qa-gate").classList.remove("hidden");
    $("qa-main").classList.add("hidden");
    $("gate-message").textContent = text;
  }

  function showMain(user) {
    $("qa-gate").classList.add("hidden");
    $("qa-main").classList.remove("hidden");
    $("admin-user").textContent = user.email || user.uid;
  }

  function isAdminEmail(email) {
    if (!email || typeof REPORT_ADMIN_EMAILS === "undefined") return false;
    return REPORT_ADMIN_EMAILS.some(
      (e) => e && e.toLowerCase() === email.toLowerCase()
    );
  }

  function statCard(label, value, sub) {
    return (
      `<div class="analytics-stat">` +
      `<div class="analytics-stat-label">${escapeHtml(label)}</div>` +
      `<div class="analytics-stat-value">${escapeHtml(value)}</div>` +
      (sub ? `<div class="analytics-stat-sub">${escapeHtml(sub)}</div>` : "") +
      `</div>`
    );
  }

  function getFilters() {
    return {
      subject: ($("qa-filter-subject") || {}).value || "all",
      mode: ($("qa-filter-mode") || {}).value || "choice",
      minAttempts: Number(($("qa-filter-min") || {}).value) || 5,
    };
  }

  function filterRows(rows, filters) {
    return rows.filter((r) => {
      if (filters.subject !== "all" && r.subjectId !== filters.subject) return false;
      if (filters.mode === "choice" && r.modeKey !== "choice") return false;
      if (filters.mode === "input" && r.modeKey !== "input") return false;
      return true;
    });
  }

  function renderDonutChart(dist) {
    const segments = dist.buckets
      .map((b) => ({
        label: b.label,
        value: dist.counts[b.id] || 0,
        color: b.color,
      }))
      .filter((s) => s.value > 0);

    if (!dist.total) {
      return '<p class="reports-empty">条件に合う問題がありません。</p>';
    }

    const size = 220;
    const cx = size / 2;
    const cy = size / 2;
    const r = 72;
    const stroke = 28;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    const arcs = segments
      .map((s) => {
        const frac = s.value / dist.total;
        const dash = frac * circumference;
        const el =
          `<circle class="qa-donut-seg" cx="${cx}" cy="${cy}" r="${r}" ` +
          `fill="none" stroke="${s.color}" stroke-width="${stroke}" ` +
          `stroke-dasharray="${dash} ${circumference - dash}" ` +
          `stroke-dashoffset="${-offset}" ` +
          `transform="rotate(-90 ${cx} ${cy})" />`;
        offset += dash;
        return el;
      })
      .join("");

    const legend = segments
      .map((s) => {
        const pct = Math.round((s.value / dist.total) * 1000) / 10;
        return (
          `<div class="qa-legend-item">` +
          `<span class="qa-legend-swatch" style="background:${s.color}"></span>` +
          `<span class="qa-legend-label">${escapeHtml(s.label)}</span>` +
          `<span class="qa-legend-value">${s.value}問（${pct}%）</span>` +
          `</div>`
        );
      })
      .join("");

    return (
      `<div class="qa-donut-wrap">` +
      `<svg class="qa-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f7" stroke-width="${stroke}" />` +
      arcs +
      `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="qa-donut-center-num">${dist.total}</text>` +
      `<text x="${cx}" y="${cy + 14}" text-anchor="middle" class="qa-donut-center-label">問</text>` +
      `</svg>` +
      `<div class="qa-legend">${legend}</div>` +
      `</div>`
    );
  }

  function renderSubjectBars(summary) {
    if (!summary.length) {
      return '<p class="reports-empty">科目別データがありません。</p>';
    }
    return (
      `<div class="qa-subject-bars">` +
      summary
        .map((s) => {
          const width = Math.max(2, s.avgPct);
          const zeroNote =
            s.zeroCount > 0
              ? ` · 0%が ${s.zeroCount}問（${s.zeroPct}%）`
              : "";
          return (
            `<div class="qa-subject-bar-row">` +
            `<div class="qa-subject-bar-head">` +
            `<span class="qa-subject-bar-label">${escapeHtml(s.subjectLabel)}</span>` +
            `<span class="qa-subject-bar-meta">${s.count}問 · 平均 ${s.avgPct}%${zeroNote}</span>` +
            `</div>` +
            `<div class="qa-bar-track">` +
            `<div class="qa-bar-fill" style="width:${width}%;background:${barColor(s.avgPct)}"></div>` +
            `</div>` +
            `</div>`
          );
        })
        .join("") +
      `</div>`
    );
  }

  function barColor(pct) {
    if (pct === 0) return "#c0392b";
    if (pct < 30) return "#e67e22";
    if (pct < 50) return "#f1c40f";
    if (pct < 70) return "#52be80";
    return "#27ae60";
  }

  function rateBadge(pct) {
    const cls =
      pct === 0
        ? "qa-rate-zero"
        : pct < 30
          ? "qa-rate-danger"
          : pct < 50
            ? "qa-rate-warn"
            : pct < 70
              ? "qa-rate-mid"
              : "qa-rate-good";
    return `<span class="qa-rate-badge ${cls}">${pct}%</span>`;
  }

  function renderQuestionsTable(rows, limit) {
    if (!rows.length) {
      return '<p class="reports-empty">条件に合う問題がありません。最低回答数やフィルタを変えてください。</p>';
    }
    const shown = rows.slice(0, limit);
    const head =
      '<table class="analytics-table qa-table">' +
      "<thead><tr>" +
      "<th>#</th><th>正答率</th><th>科目</th><th>方式</th><th>回答</th><th>正解</th><th>問題</th><th>正解内容</th>" +
      "</tr></thead><tbody>";
    const body = shown
      .map((r, i) => {
        const barW = Math.max(2, r.pct);
        return (
          "<tr>" +
          `<td class="qa-rank">${i + 1}</td>` +
          `<td class="qa-rate-cell">` +
          rateBadge(r.pct) +
          `<div class="qa-bar-track qa-bar-inline"><div class="qa-bar-fill" style="width:${barW}%;background:${barColor(r.pct)}"></div></div>` +
          `</td>` +
          `<td>${escapeHtml(r.subjectLabel)}</td>` +
          `<td>${escapeHtml(r.mode)}</td>` +
          `<td>${r.attempts}</td>` +
          `<td>${r.correct}</td>` +
          `<td class="qa-text-cell">` +
          `<code class="qa-qid">${escapeHtml(r.id)}</code>` +
          `<div class="aq-text">${escapeHtml(r.text)}</div>` +
          `</td>` +
          `<td class="aq-answer">${escapeHtml(r.answer)}</td>` +
          "</tr>"
        );
      })
      .join("");
    const more =
      rows.length > limit
        ? `<p class="qa-more-note">他 ${rows.length - limit} 問（「さらに表示」で追加）</p>`
        : "";
    return head + body + "</tbody></table>" + more;
  }

  function fillSubjectFilter() {
    const sel = $("qa-filter-subject");
    if (!sel) return;
    const keep = sel.value || "all";
    sel.innerHTML = '<option value="all">すべて</option>';
    if (typeof SUBJECT_REGISTRY !== "undefined") {
      SUBJECT_REGISTRY.forEach((s) => {
        if (s.enabled === false) return;
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.shortTitle || s.title || s.id;
        sel.appendChild(opt);
      });
    }
    sel.value = keep;
  }

  function renderAll() {
    const filters = getFilters();
    const filtered = filterRows(allRows, filters);
    const dist = shared().computeDistribution(filtered, filters.minAttempts);
    const catalog = shared().computeCatalogStats(
      metaMap,
      filtered,
      filters.mode,
      filters.subject
    );
    const subjectSummary = shared().computeSubjectSummary(
      filtered,
      filters.minAttempts,
      filters.mode
    );

    const modeLabel =
      filters.mode === "input" ? "記述式" : filters.mode === "choice" ? "選択式" : "すべて";
    const minLabel = filters.minAttempts + "回以上";

    $("qa-kpis").innerHTML =
      `<div class="analytics-stat-grid">` +
      statCard(
        "マスタ登録",
        String(catalog.catalogTotal) + "問",
        modeLabel + (filters.subject !== "all" ? " · " + shared().subjectTitle(filters.subject) : "")
      ) +
      statCard(
        "回答データあり",
        String(catalog.withAny) + "問",
        "マスタの " + catalog.coverageAnyPct + "% が1回以上回答済み"
      ) +
      statCard(
        "分析対象",
        String(dist.total) + "問",
        minLabel + "のデータがある問題"
      ) +
      statCard(
        "0%正答率",
        dist.zeroCount + "問",
        "分析対象の " + dist.zeroPct + "% が全員不正解"
      ) +
      statCard(
        "平均正答率",
        dist.total
          ? String(
              Math.round(
                dist.eligible.reduce((s, r) => s + r.pct, 0) / dist.total
              )
            ) + "%"
          : "—",
        "分析対象の単純平均"
      ) +
      `</div>`;

    $("qa-donut").innerHTML = renderDonutChart(dist);
    $("qa-subject-bars").innerHTML = renderSubjectBars(subjectSummary);

    const sorted = dist.eligible
      .slice()
      .sort((a, b) => a.pct - b.pct || b.attempts - a.attempts);

    $("qa-table-wrap").innerHTML = renderQuestionsTable(sorted, tableLimit);
    const moreBtn = $("qa-load-more");
    if (moreBtn) {
      moreBtn.classList.toggle("hidden", sorted.length <= tableLimit);
      moreBtn.textContent =
        "さらに表示（あと " + Math.max(0, sorted.length - tableLimit) + " 問）";
    }

    $("qa-insight").innerHTML =
      `<p class="qa-insight-text">` +
      `<strong>読み方:</strong> ` +
      `${minLabel}の${modeLabel}問題 ${dist.total}問のうち、` +
      `<strong>${dist.zeroCount}問（${dist.zeroPct}%）</strong>が正答率0%です。` +
      (dist.zeroPct >= 15
        ? " 0%が多い場合は問題文の難易度・誤解を招く表現・選択肢の妥当性を確認してください。"
        : " 分布が偏っていなければ概ね正常です。") +
      `</p>`;
  }

  async function loadData(db) {
    $("qa-kpis").innerHTML = '<p class="reports-loading">集計中…</p>';
    $("qa-donut").innerHTML = "";
    $("qa-subject-bars").innerHTML = "";
    $("qa-table-wrap").innerHTML = "";
    $("qa-insight").innerHTML = "";

    fillSubjectFilter();

    const [statsDocs, map] = await Promise.all([
      shared().fetchAllQuestionStats(db),
      shared().buildQuestionMetaMap(),
    ]);
    metaMap = map;
    allRows = shared().buildQuestionRows(statsDocs, metaMap);
    tableLimit = 50;
    renderAll();
  }

  function boot() {
    if (!window.AdminQuestionStatsShared) {
      showGate("集計モジュールの読み込みに失敗しました。ページを再読み込みしてください。");
      return;
    }

    if (
      typeof firebase === "undefined" ||
      typeof FIREBASE_CONFIG === "undefined" ||
      !FIREBASE_CONFIG.apiKey
    ) {
      showGate("Firebase 設定がありません。");
      return;
    }
    if (
      typeof REPORT_ADMIN_EMAILS === "undefined" ||
      !REPORT_ADMIN_EMAILS.length
    ) {
      showGate("管理者メールが未設定です。");
      return;
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    ["qa-filter-subject", "qa-filter-mode", "qa-filter-min"].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("change", () => {
          tableLimit = 50;
          renderAll();
        });
      }
    });

    const moreBtn = $("qa-load-more");
    if (moreBtn) {
      moreBtn.addEventListener("click", () => {
        tableLimit += 50;
        renderAll();
      });
    }

    $("admin-login-btn").addEventListener("click", () => {
      const email = $("admin-email").value.trim();
      const password = $("admin-password").value;
      auth.signInWithEmailAndPassword(email, password).catch((e) => {
        $("gate-message").textContent = e.message;
      });
    });

    $("admin-logout-btn").addEventListener("click", () => auth.signOut());

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        showGate("管理者としてログインしてください。");
        return;
      }
      if (!isAdminEmail(user.email)) {
        showGate("このアカウントは管理者として登録されていません。");
        auth.signOut();
        return;
      }
      showMain(user);
      $("admin-logout-btn").classList.remove("hidden");
      try {
        await loadData(db);
      } catch (e) {
        $("qa-kpis").innerHTML =
          '<p class="reports-error">集計エラー: ' + escapeHtml(e.message) + "</p>";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
