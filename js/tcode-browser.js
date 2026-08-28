/**
 * Tコード確認画面：一覧表示と双方向検索
 *
 * 検索の柔軟性:
 * - 全角英数→半角、小文字化、空白・記号の除去
 * - カタカナ↔ひらがなのゆるい同一視
 * - 同義語辞書でクエリ／キーワードを拡張（受注↔オーダー 等）
 * - code / name / description / keywords / module を横断スコアリング
 */
const TcodeBrowser = (() => {
  const SYNONYMS = [
    ["受注", "オーダ", "オーダー", "注文", "セールスオーダー", "so", "salesorder"],
    ["発注", "購買発注", "po", "パーチェスオーダ", "購買オーダー"],
    ["購買依頼", "pr", "依頼", "パーチェスリクエスト"],
    ["入庫", "gr", "goodsreceipt", "受入", "入荷"],
    ["出庫", "gi", "goodsissue", "払出"],
    ["出庫確認", "pgi", "postgoodsissue"],
    ["請求", "インボイス", "ビリング", "売上計上", "請求書"],
    ["請求書照合", "miro", "liv", "照合"],
    ["在庫", "ストック", "在庫照会", "在庫確認"],
    ["出荷", "配送", "デリバリ", "delivery"],
    ["ピッキング", "picking", "ピック"],
    ["得意先", "顧客", "カスタマ", "customer"],
    ["仕入先", "ベンダー", "サプライヤ", "vendor", "supplier"],
    ["品目", "マテリアル", "材料", "material"],
    ["勘定", "g/l", "gl", "総勘定"],
    ["支払", "振込", "支払い"],
    ["入金", "入金消込", "回収"],
    ["消込", "クリアリング", "クリア"],
    ["原価センタ", "cc", "コストセンタ", "costcenter"],
    ["製造指図", "プロダクションオーダ", "po製造", "指図"],
    ["計画手配", "plannedorder", "プランドオーダ"],
    ["mrp", "所要量計画", "資材所要量"],
    ["bom", "部品表", "構成表"],
    ["作業手順", "ルーティング", "routing"],
    ["権限", "ロール", "オーソリゼーション", "authorization"],
    ["ユーザ", "ユーザー", "アカウント"],
    ["移送", "トランスポート", "transport", "cts"],
    ["ジョブ", "バックグラウンド", "バッチジョブ", "スケジュール"],
    ["ダンプ", "短ダンプ", "ランタイムエラー"],
    ["印刷", "スプール", "プリンタ"],
    ["カスタマイズ", "カスタマイジング", "img", "設定", "コンフィグ"],
    ["見積", "クォテーション", "quotation"],
    ["契約", "基本契約", "分納契約", "アウトライン"],
    ["与信", "クレジット", "クレジットブロック"],
    ["固定資産", "資産", "asset"],
    ["減価償却", "償却"],
    ["人事", "従業員", "パーソネル"],
    ["idoc", "アイドック", "edi"],
    ["テーブル", "表", "table"],
    ["プログラム", "レポート", "report", "abap"],
  ];

  let catalog = [];
  let activeModule = "ALL";
  let searchTimer = null;

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
    const set = new Set([base]);
    // also keep spaced tokens separately for multi-word queries
    const parts = toHalfWidth(raw)
      .toLowerCase()
      .split(/[\s\u3000,/|]+/)
      .map(normalize)
      .filter(Boolean);
    parts.forEach((p) => set.add(p));

    for (const group of SYNONYMS) {
      const norms = group.map(normalize);
      if (norms.some((n) => base.includes(n) || n.includes(base) || parts.some((p) => p === n || p.includes(n) || n.includes(p)))) {
        norms.forEach((n) => set.add(n));
      }
    }
    return [...set];
  }

  function buildCatalog() {
    const map = new Map();
    const add = (row) => {
      if (!row || !row.code) return;
      const key = String(row.code).toUpperCase();
      const keywords = Array.isArray(row.keywords) ? row.keywords.slice() : [];
      keywords.push(row.code, row.name, row.module, row.description);
      if (!map.has(key)) {
        map.set(key, {
          code: row.code,
          module: row.module || "共通",
          name: row.name || "",
          description: row.description || row.name || "",
          keywords,
          fromQuiz: !!row.fromQuiz,
        });
        return;
      }
      const cur = map.get(key);
      cur.keywords = [...new Set([...(cur.keywords || []), ...keywords])];
      if (row.fromQuiz) cur.fromQuiz = true;
      if (row.description && row.description.length > (cur.description || "").length) {
        cur.description = row.description;
      }
      if (row.name && !cur.name) cur.name = row.name;
    };

    if (typeof TCODE_REF !== "undefined") {
      TCODE_REF.forEach(add);
    }
    if (typeof QUIZ_DATA !== "undefined") {
      QUIZ_DATA.filter((q) => q.category === "tcode").forEach((q) => {
        add({
          code: q.code,
          module: q.module,
          name: q.name,
          description: q.name,
          keywords: [q.name, q.code],
          fromQuiz: true,
        });
      });
    }

    const order =
      typeof TCODE_MODULE_ORDER !== "undefined"
        ? TCODE_MODULE_ORDER
        : ["FI", "CO", "MM", "SD", "PP", "HR", "BASIS", "ABAP", "共通"];

    catalog = [...map.values()].map((row) => {
      const searchBlob = normalize(
        [row.code, row.name, row.description, row.module, ...(row.keywords || [])].join(" ")
      );
      return { ...row, _blob: searchBlob, _codeN: normalize(row.code) };
    });

    catalog.sort((a, b) => {
      const ia = order.indexOf(a.module);
      const ib = order.indexOf(b.module);
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.code.localeCompare(b.code);
    });
  }

  function scoreEntry(entry, tokens, rawNorm) {
    if (!tokens.length) return 1;
    let score = 0;
    for (const t of tokens) {
      if (!t) continue;
      if (entry._codeN === t) score += 100;
      else if (entry._codeN.startsWith(t)) score += 60;
      else if (entry._codeN.includes(t)) score += 40;
      if (normalize(entry.name).includes(t)) score += 30;
      if (normalize(entry.description).includes(t)) score += 18;
      if (entry._blob.includes(t)) score += 10;
    }
    // bonus if full raw query appears
    if (rawNorm && entry._blob.includes(rawNorm)) score += 25;
    return score;
  }

  function search(query, moduleFilter) {
    const q = (query || "").trim();
    const tokens = expandTokens(q);
    const rawNorm = normalize(q);
    let rows = catalog;
    if (moduleFilter && moduleFilter !== "ALL") {
      rows = rows.filter((r) => r.module === moduleFilter);
    }
    if (!q) return rows;
    return rows
      .map((r) => ({ r, s: scoreEntry(r, tokens, rawNorm) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.r.code.localeCompare(b.r.code))
      .map((x) => x.r);
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

  function renderModules() {
    const box = document.getElementById("tcode-module-chips");
    if (!box) return;
    const counts = {};
    catalog.forEach((r) => {
      counts[r.module] = (counts[r.module] || 0) + 1;
    });
    const order =
      typeof TCODE_MODULE_ORDER !== "undefined"
        ? TCODE_MODULE_ORDER
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
    const input = document.getElementById("tcode-search");
    const listEl = document.getElementById("tcode-list");
    const countEl = document.getElementById("tcode-result-count");
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
        `<div class="tcode-empty">該当するTコードがありません。別の言い回し（例: 「在庫を見たい」「受注を作りたい」）でも試してください。</div>`;
      return;
    }
    listEl.innerHTML = rows
      .map((r) => {
        const quiz = r.fromQuiz
          ? `<span class="tcode-quiz-badge">問題あり</span>`
          : "";
        return (
          `<article class="tcode-item">` +
          `<div class="tcode-item-head">` +
          `<span class="tcode-code">${highlight(r.code, query)}</span>` +
          `<span class="tcode-mod-badge">${escapeHtml(r.module)}</span>` +
          quiz +
          `</div>` +
          `<div class="tcode-name">${highlight(r.name, query)}</div>` +
          `<div class="tcode-desc">${highlight(r.description, query)}</div>` +
          `</article>`
        );
      })
      .join("");
  }

  function bind() {
    const input = document.getElementById("tcode-search");
    const clearBtn = document.getElementById("tcode-search-clear");
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

  function show() {
    if (!catalog.length) buildCatalog();
    renderModules();
    renderResults();
    const input = document.getElementById("tcode-search");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function init() {
    buildCatalog();
    bind();
  }

  return { init, show, search, getCatalog: () => catalog };
})();
