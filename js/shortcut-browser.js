/**
 * ショートカット一覧：QUIZ_DATA の shortcut を検索・絞り込み表示する
 */
const ShortcutBrowser = (() => {
  const SYNONYMS = [
    ["コピー", "copy", "複製"],
    ["切り取り", "カット", "cut"],
    ["貼り付け", "ペースト", "paste"],
    ["元に戻す", "アンドゥ", "undo"],
    ["やり直し", "リドゥ", "redo"],
    ["検索", "find", "探す"],
    ["保存", "save"],
    ["デスクトップ", "desktop"],
    ["エクスプローラー", "explorer", "フォルダ", "フォルダー"],
    ["ロック", "lock"],
    ["設定", "settings"],
    ["クリップボード", "履歴", "clipboard"],
    ["スニップ", "スクリーンショット", "キャプチャ", "切り取り"],
    ["タスクマネージャー", "タスクマネージャ"],
    ["フィルター", "filter"],
    ["オートサム", "合計", "sum"],
    ["絶対参照", "ドル", "$"],
    ["発表", "プレゼン", "再生"],
    ["太字", "bold", "ボールド"],
    ["斜体", "italic"],
    ["下線", "underline"],
    ["タブ", "tab"],
    ["ミュート", "マイク", "mute"],
    ["タスクバー", "ピン留め"],
    ["ピボット", "pivot"],
    ["画面共有", "シェア"],
    ["挙手", "手を挙げる"],
    ["仮想デスクトップ"],
    ["スナップ", "分割"],
    ["枠の固定", "フリーズ"],
    ["値貼り付け", "値のみ"],
  ];

  let catalog = [];
  let activeModule = "ALL";
  let searchTimer = null;
  let bound = false;

  function toHalfWidth(str) {
    return String(str)
      .replace(/[\uFF01-\uFF5E]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
      )
      .replace(/\u3000/g, " ");
  }

  function kataToHira(str) {
    return String(str).replace(/[\u30A1-\u30F6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  function normalize(str) {
    return kataToHira(toHalfWidth(str))
      .toLowerCase()
      .replace(/[_\-./\\()[\]"'`~,.:\s\u3000\uFF08\uFF09\u3010\u3011\u300C\u300D\u3001\u3002\u30FB]+/g, "");
  }

  function expandTokens(raw) {
    const base = normalize(raw);
    if (!base) return [];
    const out = new Set([base]);
    SYNONYMS.forEach((group) => {
      const norms = group.map(normalize);
      if (norms.some((n) => n && (base.includes(n) || n.includes(base)))) {
        norms.forEach((n) => { if (n) out.add(n); });
      }
    });
    return [...out];
  }

  function highlight(text, query) {
    const raw = escapeHtml(text);
    const q = (query || "").trim();
    if (!q || q.length < 1) return raw;
    const tokens = [
      ...new Set(
        toHalfWidth(q)
          .split(/[\s\u3000]+/)
          .filter((t) => t.length >= 1)
          .concat([q])
      ),
    ].sort((a, b) => b.length - a.length);
    let out = raw;
    for (const t of tokens) {
      if (t.length < 1) continue;
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      out = out.replace(re, "<mark>$1</mark>");
    }
    return out;
  }

  function buildCatalog() {
    catalog = [];
    if (typeof QUIZ_DATA === "undefined") return;
    QUIZ_DATA.forEach((e) => {
      if (!e || e.category !== "shortcut") return;
      catalog.push({
        code: e.code,
        name: e.name,
        description: e.explanation || "",
        module: e.module || "",
        keywords: Array.isArray(e.keywords) ? e.keywords.join(" ") : "",
        searchBlob: [e.code, e.name, e.explanation, e.module, (e.keywords || []).join(" ")].join(" "),
      });
    });
  }

  function scoreRow(row, tokens) {
    const blob = normalize(row.searchBlob);
    let score = 0;
    tokens.forEach((t) => {
      if (!t) return;
      if (normalize(row.code) === t) score += 50;
      else if (normalize(row.code).includes(t)) score += 30;
      if (normalize(row.name).includes(t)) score += 20;
      if (blob.includes(t)) score += 8;
    });
    return score;
  }

  function search(query, module) {
    const q = (query || "").trim();
    let rows = catalog;
    if (module && module !== "ALL") rows = rows.filter((r) => r.module === module);
    if (!q) return rows;
    const tokens = expandTokens(q).concat(
      toHalfWidth(q).split(/[\s\u3000]+/).filter(Boolean).map(normalize)
    );
    return rows
      .map((r) => ({ r, s: scoreRow(r, tokens) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.r);
  }

  function renderModules() {
    const box = document.getElementById("shortcut-module-chips");
    if (!box) return;
    const counts = {};
    catalog.forEach((r) => {
      counts[r.module] = (counts[r.module] || 0) + 1;
    });
    const order =
      typeof SUBJECT !== "undefined" && SUBJECT.modules
        ? Object.keys(SUBJECT.modules)
        : Object.keys(counts);
    const mods = ["ALL", ...order.filter((m) => counts[m])];
    box.innerHTML = mods
      .map((m) => {
        const label = m === "ALL" ? "すべて" : m;
        const count = m === "ALL" ? catalog.length : counts[m] || 0;
        const active = m === activeModule ? " checked" : "";
        return (
          `<button type="button" class="chip tcode-mod-chip${active}" data-module="${escapeHtml(m)}">` +
          `<span>${escapeHtml(label)}</span>` +
          `<span class="chip-count">${count}</span>` +
          `</button>`
        );
      })
      .join("");
    box.querySelectorAll(".tcode-mod-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeModule = btn.dataset.module;
        renderModules();
        renderResults();
      });
    });
  }

  function renderResults() {
    const input = document.getElementById("shortcut-search");
    const listEl = document.getElementById("shortcut-list");
    const countEl = document.getElementById("shortcut-result-count");
    if (!listEl) return;
    const query = input ? input.value : "";
    const rows = search(query, activeModule);
    if (countEl) {
      countEl.textContent = query.trim()
        ? `${rows.length}件ヒット（全${catalog.length}件中）`
        : `全${rows.length}件`;
    }
    if (rows.length === 0) {
      listEl.innerHTML =
        `<div class="tcode-empty">該当するショートカットがありません。別の言い回し（例: 「コピー」「ロック」「合計」）でも試してください。</div>`;
      return;
    }
    listEl.innerHTML = rows
      .map(
        (r) =>
          `<article class="tcode-item">` +
          `<div class="tcode-item-head">` +
          `<span class="tcode-code">${highlight(r.code, query)}</span>` +
          `<span class="tcode-mod-badge">${escapeHtml(r.module)}</span>` +
          `</div>` +
          `<div class="tcode-name">${highlight(r.name, query)}</div>` +
          `<div class="tcode-desc">${highlight(r.description, query)}</div>` +
          `</article>`
      )
      .join("");
  }

  function bind() {
    if (bound) return;
    bound = true;
    const input = document.getElementById("shortcut-search");
    const clearBtn = document.getElementById("shortcut-search-clear");
    if (input) {
      input.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderResults, 80);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          input.value = "";
          renderResults();
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (input) input.value = "";
        renderResults();
        if (input) input.focus();
      });
    }
  }

  function hasCatalog() {
    return Array.isArray(catalog) && catalog.length > 0;
  }

  function show() {
    buildCatalog();
    activeModule = "ALL";
    renderModules();
    renderResults();
    const input = document.getElementById("shortcut-search");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function init() {
    buildCatalog();
    bind();
  }

  return { init, show, search, hasCatalog, getCatalog: () => catalog };
})();
