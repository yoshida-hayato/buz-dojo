/**
 * 学習履歴カレンダー（週・月・年）
 * 色の濃さはその日の回答数。アクションプランのヒートマップと同じ考え方。
 *
 * render(container, daily, options?)
 *   options.subjects?: [{ id, title, daily }] … 合算時の科目内訳（週表示で使用）
 */
const ActivityCalendar = (function () {
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  let view = "month";
  let anchor = "";
  let selected = "";
  /** 複数コンテナ（成績画面・マイページ）でクリックを二重登録しない */
  const boundContainers = typeof WeakSet !== "undefined" ? new WeakSet() : null;
  const boundFallback = boundContainers ? null : [];

  function todayKey() {
    const d = new Date();
    return toKey(d);
  }

  function toKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseKey(key) {
    const p = String(key || "").split("-").map(Number);
    return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1);
  }

  function addDays(key, n) {
    const d = parseKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function addMonths(key, n) {
    const d = parseKey(key);
    d.setMonth(d.getMonth() + n);
    return toKey(d);
  }

  function startOfWeek(key) {
    const d = parseKey(key);
    d.setDate(d.getDate() - d.getDay());
    return toKey(d);
  }

  function startOfMonth(key) {
    return String(key).slice(0, 7) + "-01";
  }

  function formatMd(key) {
    const d = parseKey(key);
    return d.getMonth() + 1 + "/" + d.getDate();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getDay(daily, key) {
    const v = daily && daily[key];
    if (!v) return { a: 0, c: 0 };
    return { a: Number(v.a) || 0, c: Number(v.c) || 0 };
  }

  function activityLevel(day) {
    const n = (day && day.a) || 0;
    if (n <= 0) return 0;
    if (n >= 300) return 4;
    if (n >= 150) return 3;
    if (n >= 50) return 2;
    return 1;
  }

  function titleFor(key, day) {
    if (!day || day.a <= 0) return key + " · 学習なし";
    return key + " · " + day.a + "問（正解 " + day.c + "）";
  }

  function monthGrid(anchorKey) {
    const start = startOfWeek(startOfMonth(anchorKey));
    const cells = [];
    for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
    return cells;
  }

  function yearColumns(year) {
    const start = startOfWeek(year + "-01-01");
    const cols = [];
    for (let w = 0; w < 53; w++) {
      const week = [];
      for (let r = 0; r < 7; r++) week.push(addDays(start, w * 7 + r));
      cols.push(week);
    }
    return cols;
  }

  function periodLabel() {
    const d = parseKey(anchor);
    if (view === "week") {
      const s = startOfWeek(anchor);
      return formatMd(s) + " – " + formatMd(addDays(s, 6));
    }
    if (view === "month") {
      return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
    }
    return d.getFullYear() + "年";
  }

  function jumpLabel() {
    if (view === "week") return "今週";
    if (view === "year") return "今年";
    return "今月";
  }

  function heatClass(level) {
    return "cal-heat-" + level;
  }

  function legendHtml() {
    return (
      '<div class="cal-legend">' +
      "<span>なし</span>" +
      [0, 1, 2, 3, 4]
        .map(function (lv) {
          const t =
            lv === 0 ? "0問" : lv === 1 ? "1〜49問" : lv === 2 ? "50〜149問" : lv === 3 ? "150〜299問" : "300問以上";
          return '<span class="cal-swatch ' + heatClass(lv) + '" title="' + t + '"></span>';
        })
        .join("") +
      "<span>300問+</span>" +
      "</div>"
    );
  }

  function toolbarHtml() {
    const views = [
      ["week", "週"],
      ["month", "月"],
      ["year", "年"],
    ];
    const jump = jumpLabel();
    return (
      '<div class="cal-toolbar">' +
      '<div class="cal-view-switch">' +
      views
        .map(function (pair) {
          const on = view === pair[0] ? " is-on" : "";
          return (
            '<button type="button" class="cal-view-btn' +
            on +
            '" data-cal="view" data-view="' +
            pair[0] +
            '">' +
            pair[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="cal-nav">' +
      '<button type="button" class="cal-icon-btn" data-cal="prev" aria-label="前へ">‹</button>' +
      '<button type="button" class="cal-today-btn" data-cal="today" aria-label="' +
      jump +
      'へ">' +
      jump +
      "</button>" +
      '<button type="button" class="cal-icon-btn" data-cal="next" aria-label="次へ">›</button>' +
      "</div>" +
      "</div>"
    );
  }

  function subjectDayRows(subjects, key) {
    if (!subjects || !subjects.length) return [];
    return subjects
      .map(function (s) {
        const day = getDay(s.daily, key);
        return {
          title: s.title || s.id || "科目",
          a: day.a,
          c: day.c,
        };
      })
      .filter(function (r) {
        return r.a > 0;
      })
      .sort(function (x, y) {
        return y.a - x.a;
      });
  }

  function subjectWeekRows(subjects, weekStart) {
    if (!subjects || !subjects.length) return [];
    return subjects
      .map(function (s) {
        let a = 0;
        let c = 0;
        for (let i = 0; i < 7; i++) {
          const day = getDay(s.daily, addDays(weekStart, i));
          a += day.a;
          c += day.c;
        }
        return { title: s.title || s.id || "科目", a: a, c: c };
      })
      .filter(function (r) {
        return r.a > 0;
      })
      .sort(function (x, y) {
        return y.a - x.a;
      });
  }

  function breakdownListHtml(rows) {
    if (!rows.length) {
      return '<p class="cal-breakdown-empty">この期間の科目別記録はありません。</p>';
    }
    return (
      '<ul class="cal-breakdown-list">' +
      rows
        .map(function (r) {
          const pct = r.a > 0 ? Math.round((r.c / r.a) * 100) : 0;
          return (
            "<li>" +
            '<span class="cal-breakdown-name">' +
            escapeHtml(r.title) +
            "</span>" +
            '<span class="cal-breakdown-meta">' +
            r.a +
            "問 · 正解 " +
            r.c +
            "（" +
            pct +
            "%）</span>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function weekBreakdownHtml(opts) {
    if (view !== "week") return "";
    const subjects = (opts && opts.subjects) || [];
    if (!subjects.length) return "";
    const weekStart = startOfWeek(anchor);
    const weekRows = subjectWeekRows(subjects, weekStart);
    const dayRows = subjectDayRows(subjects, selected);
    return (
      '<div class="cal-breakdown">' +
      '<div class="cal-breakdown-block">' +
      '<p class="cal-breakdown-title">今週の合算内訳</p>' +
      breakdownListHtml(weekRows) +
      "</div>" +
      '<div class="cal-breakdown-block">' +
      '<p class="cal-breakdown-title">選択日の内訳</p>' +
      breakdownListHtml(dayRows) +
      "</div>" +
      "</div>"
    );
  }

  function detailHtml(daily, opts) {
    const day = getDay(daily, selected);
    const d = parseKey(selected);
    const dateLabel = d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    if (day.a <= 0) {
      return (
        '<p class="cal-detail">' +
        dateLabel +
        " — この日の記録はまだありません。導入前の回答は日付に載りません。</p>" +
        weekBreakdownHtml(opts)
      );
    }
    const pct = Math.round((day.c / day.a) * 100);
    return (
      '<p class="cal-detail">' +
      dateLabel +
      " — <strong>" +
      day.a +
      "問</strong>回答、正解 " +
      day.c +
      "問（正答率 " +
      pct +
      "%）</p>" +
      weekBreakdownHtml(opts)
    );
  }

  function weekHtml(daily, today) {
    const start = startOfWeek(anchor);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
    return (
      '<div class="cal-weekdays cal-weekdays-7">' +
      WEEKDAYS.map(function (w) {
        return "<span>" + w + "</span>";
      }).join("") +
      "</div>" +
      '<div class="cal-week-grid">' +
      days
        .map(function (key) {
          const day = getDay(daily, key);
          const lv = activityLevel(day);
          const cls = [
            "cal-cell",
            "cal-cell-week",
            heatClass(lv),
            key === today ? "is-today" : "",
            key === selected ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            '<button type="button" class="' +
            cls +
            '" data-cal="day" data-date="' +
            key +
            '" title="' +
            titleFor(key, day) +
            '">' +
            '<span class="cal-wd">' +
            WEEKDAYS[parseKey(key).getDay()] +
            "</span>" +
            '<span class="cal-num">' +
            formatMd(key) +
            "</span>" +
            (day.a > 0 ? '<span class="cal-count">' + day.a + "問</span>" : "") +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function monthHtml(daily, today) {
    const cells = monthGrid(anchor);
    const monthPrefix = startOfMonth(anchor).slice(0, 7);
    return (
      '<div class="cal-weekdays cal-weekdays-7">' +
      WEEKDAYS.map(function (w) {
        return "<span>" + w + "</span>";
      }).join("") +
      "</div>" +
      '<div class="cal-month-grid">' +
      cells
        .map(function (key) {
          const day = getDay(daily, key);
          const lv = activityLevel(day);
          const outside = key.slice(0, 7) !== monthPrefix;
          const cls = [
            "cal-cell",
            "cal-cell-month",
            heatClass(lv),
            key === today ? "is-today" : "",
            key === selected ? "is-selected" : "",
            outside ? "is-outside" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            '<button type="button" class="' +
            cls +
            '" data-cal="day" data-date="' +
            key +
            '" title="' +
            titleFor(key, day) +
            '">' +
            '<span class="cal-num">' +
            parseKey(key).getDate() +
            "</span>" +
            (day.a > 0 ? '<span class="cal-count">' + day.a + "</span>" : "") +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function yearHtml(daily, today) {
    const year = parseKey(anchor).getFullYear();
    const cols = yearColumns(year);
    const ticks = [];
    let lastMonth = -1;
    cols.forEach(function (week, i) {
      const inYear = week.find(function (d) {
        return d.startsWith(String(year));
      });
      if (!inYear) return;
      const m = parseKey(inYear).getMonth();
      if (m !== lastMonth) {
        ticks.push({ label: String(m + 1), index: i });
        lastMonth = m;
      }
    });
    const tickAt = {};
    ticks.forEach(function (t) {
      tickAt[t.index] = t.label;
    });

    let html =
      '<div class="cal-year-wrap"><div class="cal-year-inner">' +
      '<div class="cal-year-months" style="grid-template-columns: 1.4rem repeat(' +
      cols.length +
      ', minmax(0, 1fr))"><span></span>';
    for (let i = 0; i < cols.length; i++) {
      html += "<span>" + (tickAt[i] ? tickAt[i] + "月" : "") + "</span>";
    }
    html += "</div>";

    WEEKDAYS.forEach(function (label, row) {
      html +=
        '<div class="cal-year-row" style="grid-template-columns: 1.4rem repeat(' +
        cols.length +
        ', minmax(0, 1fr))"><span class="cal-year-wd">' +
        label +
        "</span>";
      cols.forEach(function (week) {
        const key = week[row];
        const inYear = key.startsWith(String(year));
        if (!inYear) {
          html += '<span class="cal-year-empty"></span>';
          return;
        }
        const day = getDay(daily, key);
        const lv = activityLevel(day);
        const cls = [
          "cal-year-cell",
          heatClass(lv),
          key === today ? "is-today" : "",
          key === selected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        html +=
          '<button type="button" class="' +
          cls +
          '" data-cal="day" data-date="' +
          key +
          '" title="' +
          titleFor(key, day) +
          '"></button>';
      });
      html += "</div>";
    });
    html += "</div></div>";
    return html;
  }

  function bodyHtml(daily) {
    const today = todayKey();
    if (view === "week") return weekHtml(daily, today);
    if (view === "year") return yearHtml(daily, today);
    return monthHtml(daily, today);
  }

  function paint(container, daily) {
    const opts = container._calOptions || {};
    container.innerHTML =
      toolbarHtml() +
      '<div class="cal-meta"><p class="cal-period">' +
      periodLabel() +
      "</p>" +
      legendHtml() +
      "</div>" +
      bodyHtml(daily) +
      detailHtml(daily, opts);
  }

  function goPrev() {
    if (view === "week") anchor = addDays(anchor, -7);
    else if (view === "month") anchor = addMonths(anchor, -1);
    else anchor = addMonths(anchor, -12);
  }

  function goNext() {
    if (view === "week") anchor = addDays(anchor, 7);
    else if (view === "month") anchor = addMonths(anchor, 1);
    else anchor = addMonths(anchor, 12);
  }

  function onClick(e) {
    const container = e.currentTarget;
    const btn = e.target.closest("[data-cal]");
    if (!btn || !container.contains(btn)) return;
    const daily = container._daily || {};
    const act = btn.getAttribute("data-cal");
    if (act === "view") {
      view = btn.getAttribute("data-view") || "month";
    } else if (act === "prev") {
      goPrev();
    } else if (act === "next") {
      goNext();
    } else if (act === "today") {
      const t = todayKey();
      anchor = t;
      selected = t;
    } else if (act === "day") {
      selected = btn.getAttribute("data-date") || selected;
      anchor = selected;
    }
    paint(container, daily);
  }

  function render(container, daily, options) {
    if (!container) return;
    if (!anchor) {
      const t = todayKey();
      anchor = t;
      selected = t;
    }
    container._daily = daily || {};
    container._calOptions = options || {};
    let alreadyBound = false;
    if (boundContainers) {
      alreadyBound = boundContainers.has(container);
      if (!alreadyBound) boundContainers.add(container);
    } else {
      alreadyBound = boundFallback.indexOf(container) >= 0;
      if (!alreadyBound) boundFallback.push(container);
    }
    if (!alreadyBound) {
      container.addEventListener("click", onClick);
    }
    paint(container, container._daily);
  }

  return { render };
})();
