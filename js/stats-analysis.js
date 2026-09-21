/**
 * 成績分析の共通ロジック
 * index.html の成績画面で使用
 */
const StatsAnalysis = (function () {
  const MODULE_LABELS = {
    FI: "FI",
    CO: "CO",
    MM: "MM",
    SD: "SD",
    PP: "PP",
    HR: "HR",
    BASIS: "BASIS",
    ABAP: "ABAP",
    共通: "共通",
    略称: "略称",
  };

  const LIST_LIMIT = 10;
  const REVIEW_TOP = 5;
  const MIN_MODULE_ATTEMPTS = 5;

  const PRIORITY_LABELS = {
    1: "★★★ 最優先",
    2: "★★ 重要",
    3: "★ 余裕があれば",
  };

  const CATEGORY_LABELS = {
    tcode_choice: "Tコード（選択式）",
    tcode_input: "Tコード（記述式）",
    shortcut: "ショートカット",
    term: "SAP用語",
    scenario: "シナリオ",
    judgment: "正誤",
    abbr: "略称",
  };

  const MIN_CATEGORY_ATTEMPTS = 5;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function acc(correct, answered) {
    return answered === 0 ? 0 : Math.round((correct / answered) * 100);
  }

  function labelForModule(key) {
    return MODULE_LABELS[key] || key;
  }

  function getWrongEntries(stats) {
    const q = (stats && stats.q) || {};
    return QUIZ_DATA
      .map((entry) => ({ entry, s: q[entry.id] }))
      .filter((x) => x.s && x.s.a > x.s.c)
      .sort((a, b) => (b.s.a - b.s.c) - (a.s.a - a.s.c));
  }

  function getWeakEntries(stats) {
    const q = (stats && stats.q) || {};
    return QUIZ_DATA
      .map((entry) => ({ entry, s: q[entry.id] }))
      .filter((x) => x.s && x.s.a >= 2)
      .map((x) => ({ ...x, rate: acc(x.s.c, x.s.a) }))
      .filter((x) => x.rate < 80)
      .sort((a, b) => a.rate - b.rate);
  }

  /** 優先度別: 習得率（全問題ベース）と正答率（回答ベース） */
  function priorityStatsRows(stats) {
    return [1, 2, 3].map((pri) => {
      const questions = QUIZ_DATA.filter((q) => (q.priority || 3) === pri);
      const total = questions.length;
      let mastered = 0;
      let answered = 0;
      let correct = 0;
      questions.forEach((entry) => {
        const s = (stats.q || {})[entry.id];
        if (!s) return;
        if (QuizStorage.isChoiceMastered(s)) mastered += 1;
        answered += s.a;
        correct += s.c;
      });
      return {
        priority: pri,
        label: PRIORITY_LABELS[pri],
        total,
        mastered,
        masteryPct: total === 0 ? 0 : Math.round((mastered / total) * 100),
        answered,
        correct,
        accPct: answered === 0 ? null : acc(correct, answered),
      };
    });
  }

  function renderPriorityStats(container, stats) {
    container.innerHTML = "";
    const rows = priorityStatsRows(stats);
    rows.forEach((r) => {
      const block = document.createElement("div");
      block.className = "priority-stat-block" + (r.priority === 1 ? " is-priority-1" : "");
      const accBar = r.accPct == null
        ? `<div class="empty-note priority-no-data">まだ回答データなし</div>`
        : `<div class="priority-metric-row">` +
          `<span class="priority-metric-label">正答率</span>` +
          `<div class="ms-bar"><div class="progress-bar small"><div class="progress-fill" style="width:${r.accPct}%"></div></div></div>` +
          `<span class="priority-metric-value">${r.accPct}%（${r.correct}/${r.answered}）</span>` +
          `</div>`;
      block.innerHTML =
        `<div class="priority-stat-head">` +
          `<span class="priority-stat-title">${esc(r.label)}</span>` +
          `<span class="priority-stat-count">${r.total}問</span>` +
        `</div>` +
        `<div class="priority-metric-row">` +
          `<span class="priority-metric-label">習得率</span>` +
          `<div class="ms-bar"><div class="progress-bar small"><div class="progress-fill is-mastery" style="width:${r.masteryPct}%"></div></div></div>` +
          `<span class="priority-metric-value">${r.mastered}/${r.total}（${r.masteryPct}%）</span>` +
        `</div>` +
        accBar;
      container.appendChild(block);
    });
  }

  /** カテゴリ別: 習得率（全問題ベース）と正答率（回答ベース）。Tコードは選択／記述に分割 */
  function categoryStatsRows(stats) {
    const buckets = {
      tcode_choice: { key: "tcode_choice", total: 0, mastered: 0, a: 0, c: 0 },
      tcode_input: { key: "tcode_input", total: 0, mastered: 0, a: 0, c: 0 },
      shortcut: { key: "shortcut", total: 0, mastered: 0, a: 0, c: 0 },
      term: { key: "term", total: 0, mastered: 0, a: 0, c: 0 },
      scenario: { key: "scenario", total: 0, mastered: 0, a: 0, c: 0 },
      judgment: { key: "judgment", total: 0, mastered: 0, a: 0, c: 0 },
      abbr: { key: "abbr", total: 0, mastered: 0, a: 0, c: 0 },
    };

    QUIZ_DATA.forEach((entry) => {
      const s = (stats.q || {})[entry.id];
      if (entry.category === "tcode") {
        buckets.tcode_choice.total += 1;
        buckets.tcode_input.total += 1;
        if (s) {
          if (QuizStorage.isChoiceMastered(s)) buckets.tcode_choice.mastered += 1;
          if ((s.ik || 0) >= 2) buckets.tcode_input.mastered += 1;
          const ia = s.ia || 0;
          const ic = s.ic || 0;
          buckets.tcode_choice.a += s.a - ia;
          buckets.tcode_choice.c += s.c - ic;
          buckets.tcode_input.a += ia;
          buckets.tcode_input.c += ic;
        }
        return;
      }
      const b = buckets[entry.category];
      if (!b) return;
      b.total += 1;
      if (s) {
        if (QuizStorage.isChoiceMastered(s)) b.mastered += 1;
        b.a += s.a;
        b.c += s.c;
      }
    });

    return Object.values(buckets)
      .filter((r) => r.total > 0)
      .map((r) => ({
        ...r,
        label: CATEGORY_LABELS[r.key] || r.key,
        masteryPct: r.total === 0 ? 0 : Math.round((r.mastered / r.total) * 100),
        accPct: r.a === 0 ? null : acc(r.c, r.a),
      }))
      .sort((a, b) => {
        const ar = a.accPct == null ? 101 : a.accPct;
        const br = b.accPct == null ? 101 : b.accPct;
        return ar - br || a.masteryPct - b.masteryPct;
      });
  }

  /** @deprecated 互換用エイリアス */
  function categoryAccuracyRows(stats) {
    return categoryStatsRows(stats)
      .filter((r) => r.a > 0)
      .map((r) => ({ key: r.key, a: r.a, c: r.c, rate: r.accPct, label: r.label }));
  }

  function metricRowHtml(label, pct, valueText, fillClass) {
    return (
      `<div class="priority-metric-row">` +
        `<span class="priority-metric-label">${label}</span>` +
        `<div class="ms-bar"><div class="progress-bar small"><div class="progress-fill${fillClass ? ` ${fillClass}` : ""}" style="width:${pct}%"></div></div></div>` +
        `<span class="priority-metric-value">${valueText}</span>` +
      `</div>`
    );
  }

  function renderCategoryAccuracy(container, stats, overallRate) {
    container.innerHTML = "";
    const rows = categoryStatsRows(stats);
    if (rows.length === 0) {
      container.innerHTML = `<div class="empty-note">まだデータがありません。クイズに挑戦しましょう。</div>`;
      return;
    }
    rows.forEach((r) => {
      const belowAvg = r.accPct != null && r.a >= MIN_CATEGORY_ATTEMPTS && r.accPct < overallRate - 5;
      const block = document.createElement("div");
      block.className = "dual-stat-block" + (belowAvg ? " is-below-avg" : "");
      const accRow = r.accPct == null
        ? `<div class="empty-note priority-no-data">まだ回答データなし</div>`
        : metricRowHtml(
            "正答率",
            r.accPct,
            `${r.accPct}%（${r.c}/${r.a}）`,
            belowAvg ? "is-warning" : ""
          );
      block.innerHTML =
        `<div class="priority-stat-head">` +
          `<span class="priority-stat-title">${esc(r.label)}</span>` +
          `<span class="priority-stat-count">${r.total}問</span>` +
        `</div>` +
        metricRowHtml("習得率", r.masteryPct, `${r.mastered}/${r.total}（${r.masteryPct}%）`, "is-mastery") +
        accRow;
      container.appendChild(block);
    });
  }

  /** モジュール別: 習得率（全問題ベース）と正答率（回答ベース） */
  function moduleStatsRows(stats) {
    const map = {};
    QUIZ_DATA.forEach((entry) => {
      const key = entry.module;
      if (!map[key]) map[key] = { key, total: 0, mastered: 0, a: 0, c: 0 };
      map[key].total += 1;
      const s = (stats.q || {})[entry.id];
      if (!s) return;
      if (QuizStorage.isChoiceMastered(s)) map[key].mastered += 1;
      if (s.a > 0) {
        map[key].a += s.a;
        map[key].c += s.c;
      }
    });
    return Object.values(map)
      .filter((r) => r.total > 0)
      .map((r) => ({
        ...r,
        masteryPct: Math.round((r.mastered / r.total) * 100),
        accPct: r.a === 0 ? null : acc(r.c, r.a),
      }))
      .sort((a, b) => {
        const ar = a.accPct == null ? 101 : a.accPct;
        const br = b.accPct == null ? 101 : b.accPct;
        return ar - br || a.masteryPct - b.masteryPct || b.total - a.total;
      });
  }

  /** @deprecated 互換用エイリアス */
  function moduleAccuracyRows(stats) {
    return moduleStatsRows(stats)
      .filter((r) => r.a > 0)
      .map((r) => ({ key: r.key, a: r.a, c: r.c, rate: r.accPct }));
  }

  /** 復習優先スコア（高いほど先に復習） */
  function reviewScore(entry, s) {
    const rate = acc(s.c, s.a);
    const wrong = s.a - s.c;
    const pri = entry.priority || 3;
    const notMastered = QuizStorage.isChoiceMastered(s) ? 0 : 1;
    return wrong * 12 + (100 - rate) * 0.4 + (4 - pri) * 8 + notMastered * 6;
  }

  function getReviewPriorities(stats, limit) {
    return QUIZ_DATA
      .map((entry) => {
        const s = (stats.q || {})[entry.id];
        if (!s || s.a === 0 || s.c === s.a) return null;
        const rate = acc(s.c, s.a);
        return {
          entry,
          s,
          rate,
          wrong: s.a - s.c,
          score: reviewScore(entry, s),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || REVIEW_TOP);
  }

  function renderModuleAccuracy(container, stats, overallRate) {
    container.innerHTML = "";
    const rows = moduleStatsRows(stats);
    if (rows.length === 0) {
      container.innerHTML = `<div class="empty-note">まだデータがありません。クイズに挑戦しましょう。</div>`;
      return;
    }
    rows.forEach((r) => {
      const belowAvg = r.accPct != null && r.a >= MIN_MODULE_ATTEMPTS && r.accPct < overallRate - 5;
      const block = document.createElement("div");
      block.className = "dual-stat-block" + (belowAvg ? " is-below-avg" : "");
      const accRow = r.accPct == null
        ? `<div class="empty-note priority-no-data">まだ回答データなし</div>`
        : metricRowHtml(
            "正答率",
            r.accPct,
            `${r.accPct}%（${r.c}/${r.a}）`,
            belowAvg ? "is-warning" : ""
          );
      block.innerHTML =
        `<div class="priority-stat-head">` +
          `<span class="priority-stat-title">${esc(labelForModule(r.key))}</span>` +
          `<span class="priority-stat-count">${r.total}問</span>` +
        `</div>` +
        metricRowHtml("習得率", r.masteryPct, `${r.mastered}/${r.total}（${r.masteryPct}%）`, "is-mastery") +
        accRow;
      container.appendChild(block);
    });
  }

  function renderReviewTop(container, items) {
    container.innerHTML = "";
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-note">優先復習の候補はありません。よくできています。</div>`;
      return;
    }
    items.forEach((item, i) => {
      const pri = item.entry.priority || 3;
      const priLabel = pri === 1 ? "★★★" : pri === 2 ? "★★" : "★";
      const mastered = QuizStorage.isChoiceMastered(item.s);
      const row = document.createElement("div");
      row.className = "review-priority-item";
      row.innerHTML =
        `<span class="rp-rank">${i + 1}</span>` +
        `<div class="rp-body">` +
          `<div class="rp-head">` +
            `<span class="rp-code">${esc(item.entry.code)}</span>` +
            `<span class="rp-pri">${priLabel}</span>` +
            `<span class="rp-module">${esc(labelForModule(item.entry.module))}</span>` +
          `</div>` +
          `<div class="rp-name">${esc(item.entry.name)}</div>` +
          `<div class="rp-meta">不正解 ${item.wrong}回 · 正答率 ${item.rate}% · ${mastered ? "習得済み" : "未習得"}</div>` +
        `</div>`;
      container.appendChild(row);
    });
  }

  function renderLimitedList(box, items, expanded, onToggle, makeRow) {
    box.innerHTML = "";
    const shown = expanded ? items : items.slice(0, LIST_LIMIT);
    shown.forEach((item) => box.appendChild(makeRow(item)));
    if (items.length > LIST_LIMIT) {
      const btn = document.createElement("button");
      btn.className = "link-btn list-toggle";
      btn.textContent = expanded
        ? `先頭${LIST_LIMIT}問だけ表示する`
        : `すべて表示する（全${items.length}問）`;
      btn.addEventListener("click", onToggle);
      box.appendChild(btn);
    }
  }

  function renderWrongList(box, entries, expanded, onToggle) {
    if (entries.length === 0) {
      box.innerHTML = `<div class="empty-note">間違えた問題はありません。</div>`;
      return;
    }
    renderLimitedList(box, entries, expanded, onToggle, ({ entry, s }) => {
      const div = document.createElement("div");
      div.className = "weak-item";
      div.innerHTML =
        `<span class="wk-code">${esc(entry.code)}</span>` +
        `<span class="wk-name">${esc(entry.name)}</span>` +
        `<span class="wk-rate">${s.a - s.c}回 不正解</span>`;
      return div;
    });
  }

  function renderWeakList(box, entries, expanded, onToggle) {
    if (entries.length === 0) {
      box.innerHTML = `<div class="empty-note">苦手な問題はまだ検出されていません（2回以上挑戦した問題が対象です）。</div>`;
      return;
    }
    renderLimitedList(box, entries, expanded, onToggle, ({ entry, s, rate }) => {
      const div = document.createElement("div");
      div.className = "weak-item";
      div.innerHTML =
        `<span class="wk-code">${esc(entry.code)}</span>` +
        `<span class="wk-name">${esc(entry.name)}</span>` +
        `<span class="wk-rate">${rate}%（${s.c}/${s.a}）</span>`;
      return div;
    });
  }

  const TREND_MAX_POINTS = 48;
  /** 1問だけの0%/100%を避けるため、この件数以上から折れ線を描く */
  const TREND_MIN_SAMPLE = 20;
  /** 記述式は窓が100問なので、少し早めに推移を見せる */
  const INPUT_TREND_MIN_SAMPLE = 10;

  /**
   * 正誤ログから、各回答時点の「直近正答率」を時系列化。
   * 開始直後の少数サンプルは除外。保存上限を超えた古い分は切り捨て済み。
   */
  function accuracyTrendFromLog(logRaw, windowSize, maxPoints, minSample) {
    const log = Array.isArray(logRaw) ? logRaw.map((v) => (v ? 1 : 0)) : [];
    const minPts = minSample || TREND_MIN_SAMPLE;
    if (log.length === 0) {
      return { points: [], sample: 0, windowSize, currentPct: null, comparePct: null, minSample: minPts };
    }

    const full = [];
    let windowCorrect = 0;
    for (let i = 0; i < log.length; i++) {
      windowCorrect += log[i];
      if (i >= windowSize) windowCorrect -= log[i - windowSize];
      const n = i + 1;
      const sample = Math.min(n, windowSize);
      if (n < minPts) continue;
      full.push({
        index: n,
        pct: Math.round((windowCorrect / sample) * 100),
        correct: windowCorrect,
        answered: sample,
      });
    }

    const recentSample = Math.min(log.length, windowSize);
    const recentCorrect = log.slice(-recentSample).reduce((sum, v) => sum + v, 0);
    const lastPct = recentSample === 0 ? 0 : Math.round((recentCorrect / recentSample) * 100);

    // 現在の直近窓 vs 窓幅ぶん前（選択式500・記述式100）の直近窓
    let comparePct = null;
    if (log.length > windowSize) {
      const end = log.length - windowSize;
      const start = Math.max(0, end - windowSize);
      const slice = log.slice(start, end);
      const correct = slice.reduce((sum, v) => sum + v, 0);
      comparePct = Math.round((correct / slice.length) * 100);
    }

    if (full.length === 0) {
      return {
        points: [],
        sample: log.length,
        windowSize,
        currentPct: lastPct,
        comparePct,
        minSample: minPts,
      };
    }

    const limit = maxPoints || TREND_MAX_POINTS;
    let points = full;
    if (full.length > limit) {
      const picked = [];
      for (let i = 0; i < limit; i++) {
        const idx = i === limit - 1 ? full.length - 1 : Math.round((i * (full.length - 1)) / (limit - 1));
        picked.push(full[idx]);
      }
      points = picked.filter((p, i, arr) => i === 0 || p.index !== arr[i - 1].index);
    }

    return {
      points,
      sample: log.length,
      windowSize,
      currentPct: lastPct,
      comparePct,
      minSample: minPts,
    };
  }

  /**
   * choiceLog 全履歴から、各回答時点の「直近正答率」（窓＝RECENT_ACCURACY_WINDOW）を時系列化。
   */
  function recentAccuracyTrend(stats, maxPoints) {
    const windowSize = typeof RECENT_ACCURACY_WINDOW === "number" ? RECENT_ACCURACY_WINDOW : 500;
    const trend = accuracyTrendFromLog(stats.choiceLog, windowSize, maxPoints, TREND_MIN_SAMPLE);
    const choiceAttempts = Math.max(
      0,
      (Number(stats && stats.answered) || 0) - (Number(stats && stats.inputAnswered) || 0)
    );
    trend.totalAttempts = choiceAttempts;
    trend.logCoverage =
      choiceAttempts > 0 ? Math.min(100, Math.round((trend.sample / choiceAttempts) * 100)) : 100;
    return trend;
  }

  /** inputLog から記述式の直近正答率推移を時系列化（窓＝RECENT_INPUT_ACCURACY_WINDOW） */
  function recentInputAccuracyTrend(stats, maxPoints) {
    const windowSize =
      typeof RECENT_INPUT_ACCURACY_WINDOW === "number" ? RECENT_INPUT_ACCURACY_WINDOW : 100;
    const trend = accuracyTrendFromLog(stats.inputLog, windowSize, maxPoints, INPUT_TREND_MIN_SAMPLE);
    const attempts = Number(stats && stats.inputAnswered) || 0;
    trend.totalAttempts = attempts;
    trend.logCoverage =
      attempts > 0 ? Math.min(100, Math.round((trend.sample / attempts) * 100)) : 100;
    return trend;
  }

  function renderAccuracyTrendChart(container, trend, options) {
    const {
      emptyNote,
      waitingNote,
      ariaLabel,
      themeClass,
    } = options;
    container.innerHTML = "";
    container.classList.toggle("is-input-trend", !!themeClass);

    if (trend.sample === 0) {
      container.innerHTML = `<div class="empty-note">${esc(emptyNote)}</div>`;
      return;
    }
    if (trend.points.length === 0) {
      const need = Math.max(0, trend.minSample - trend.sample);
      container.innerHTML =
        `<div class="acc-trend-summary">` +
          `<span class="acc-trend-current">${trend.currentPct}%</span>` +
          `<span class="acc-trend-meta">保存 ${trend.sample}問 · 窓 ${trend.windowSize}問</span>` +
        `</div>` +
        `<div class="empty-note">${esc(waitingNote.replace("{need}", String(need)).replace("{min}", String(trend.minSample)))}</div>`;
      return;
    }

    const W = 400;
    const H = 180;
    const padL = 36;
    const padR = 12;
    const padT = 16;
    const padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const pts = trend.points;

    const pcts = pts.map((p) => p.pct);
    let yMin = Math.min(...pcts);
    let yMax = Math.max(...pcts);
    if (yMin === yMax) {
      yMin = Math.max(0, yMin - 5);
      yMax = Math.min(100, yMax + 5);
    }
    const pad = Math.max(2, (yMax - yMin) * 0.2);
    yMin = Math.max(0, Math.floor(yMin - pad));
    yMax = Math.min(100, Math.ceil(yMax + pad));
    if (yMax - yMin < 8) {
      const mid = (yMin + yMax) / 2;
      yMin = Math.max(0, Math.floor(mid - 4));
      yMax = Math.min(100, Math.ceil(mid + 4));
      if (yMax - yMin < 8) {
        if (yMin <= 0) yMax = Math.min(100, yMin + 8);
        else yMin = Math.max(0, yMax - 8);
      }
    }
    const ySpan = Math.max(1, yMax - yMin);

    const xAt = (i) => padL + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
    const yAt = (pct) => padT + plotH * (1 - (pct - yMin) / ySpan);

    const lineCoords = pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.pct).toFixed(1)}`).join(" ");
    const areaCoords =
      `${xAt(0).toFixed(1)},${(padT + plotH).toFixed(1)} ` +
      lineCoords +
      ` ${xAt(pts.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)}`;

    const tickStep = ySpan <= 10 ? 2 : ySpan <= 20 ? 5 : ySpan <= 40 ? 10 : 20;
    const gridYs = [yMin];
    for (let t = Math.ceil((yMin + 0.001) / tickStep) * tickStep; t < yMax; t += tickStep) {
      gridYs.push(t);
    }
    if (gridYs[gridYs.length - 1] !== yMax) gridYs.push(yMax);

    const gridSvg = gridYs
      .map((g) => {
        const y = yAt(g).toFixed(1);
        return (
          `<line class="acc-trend-grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" />` +
          `<text class="acc-trend-axis" x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end">${g}%</text>`
        );
      })
      .join("");

    const dots =
      pts.length <= 24
        ? pts
            .map(
              (p, i) =>
                `<circle class="acc-trend-dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(p.pct).toFixed(1)}" r="3" />`
            )
            .join("")
        : `<circle class="acc-trend-dot is-end" cx="${xAt(pts.length - 1).toFixed(1)}" cy="${yAt(pts[pts.length - 1].pct).toFixed(1)}" r="4" />`;

    const delta =
      trend.comparePct == null || trend.currentPct == null
        ? ""
        : trend.currentPct - trend.comparePct;
    const compareLabel = `${trend.windowSize}問前比`;
    const deltaText =
      typeof delta === "number"
        ? delta > 0
          ? `（${compareLabel} +${delta}pt）`
          : delta < 0
            ? `（${compareLabel} ${delta}pt）`
            : `（${compareLabel} ±0）`
        : "";

    const summary =
      `<div class="acc-trend-summary">` +
        `<span class="acc-trend-current">${trend.currentPct}%</span>` +
        `<span class="acc-trend-meta">保存 ${trend.sample}問 · 直近 ${Math.min(trend.sample, trend.windowSize)}/${trend.windowSize}問 ${esc(deltaText)}</span>` +
      `</div>`;
    const coverageNote =
      trend.totalAttempts > 100 && trend.logCoverage < 60
        ? `<p class="setting-hint" style="margin:6px 0 0">正誤ログは計測開始以降の ${trend.sample}問分です（累計選択式 約${trend.totalAttempts}問）。それより前の回答は推移に含まれません。</p>`
        : "";

    const firstIdx = pts[0].index;
    const lastIdx = pts[pts.length - 1].index;
    const svg =
      `<div class="acc-trend-chart-wrap">` +
        `<svg class="acc-trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">` +
          gridSvg +
          `<polygon class="acc-trend-area" points="${areaCoords}" />` +
          `<polyline class="acc-trend-line" points="${lineCoords}" fill="none" />` +
          dots +
          `<text class="acc-trend-x" x="${padL}" y="${H - 6}" text-anchor="start">${firstIdx}問目</text>` +
          `<text class="acc-trend-x" x="${W - padR}" y="${H - 6}" text-anchor="end">${lastIdx}問目</text>` +
        `</svg>` +
      `</div>`;

    container.innerHTML = summary + coverageNote + svg;
  }

  function renderRecentAccuracyTrend(container, stats) {
    renderAccuracyTrendChart(container, recentAccuracyTrend(stats), {
      emptyNote: "選択式を解くと、直近正答率の推移が折れ線で表示されます。",
      waitingNote: "推移グラフは選択式{min}問以上から表示（あと{need}問）",
      ariaLabel: "選択式直近正答率の推移",
      themeClass: false,
    });
  }

  function renderInputAccuracyTrend(container, stats) {
    if (!container) return;
    renderAccuracyTrendChart(container, recentInputAccuracyTrend(stats), {
      emptyNote: "記述式を解くと、直近正答率の推移が折れ線で表示されます。",
      waitingNote: "推移グラフは記述式{min}問以上から表示（あと{need}問）",
      ariaLabel: "記述式直近正答率の推移",
      themeClass: true,
    });
  }

  return {
    LIST_LIMIT,
    REVIEW_TOP,
    reviewScore,
    getWrongEntries,
    getWeakEntries,
    categoryAccuracyRows,
    categoryStatsRows,
    renderCategoryAccuracy,
    moduleAccuracyRows,
    moduleStatsRows,
    getReviewPriorities,
    priorityStatsRows,
    renderModuleAccuracy,
    renderPriorityStats,
    renderReviewTop,
    renderWrongList,
    renderWeakList,
    recentAccuracyTrend,
    recentInputAccuracyTrend,
    renderRecentAccuracyTrend,
    renderInputAccuracyTrend,
  };
})();
