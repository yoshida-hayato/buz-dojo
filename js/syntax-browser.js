/**
 * ABAP構文確認画面：やりたいこと／構文の横断検索
 */
const SyntaxBrowser = (() => {
  const SYNONYMS = [
    ["変数", "宣言", "data"],
    ["定数", "constants", "固定値"],
    ["代入", "move", "いれる", "セット"],
    ["初期化", "clear", "リセット"],
    ["余り", "mod", "剰余"],
    ["商", "div", "整数除算"],
    ["べき乗", "累乗", "2乗"],
    ["空", "初期値", "initial", "未入力"],
    ["ループ", "繰り返し", "loop", "do", "while"],
    ["条件", "if", "分岐", "case"],
    ["メッセージ", "エラー", "警告", "message"],
    ["デバッグ", "デバッガ", "/h", "ブレーク"],
    ["ウォッチ", "watchpoint", "値変化"],
    ["汎用モジュール", "function module", "fm", "bapi"],
    ["クラス", "メソッド", "oo", "インスタンス", "静的"],
    ["例外", "try", "catch", "endtry", "cx_"],
    ["構造", "structure", "begin of", "作業領域", "ls_"],
    ["内部テーブル", "itab", "append", "insert", "modify", "collect", "hashed", "sorted", "キー指定", "unique", "non-unique", "一意", "非一意", "sort", "stable", "free", "refresh", "ヘッダ行"],
    ["サブルーチン", "perform", "form", "endform", "サブルーチン呼出"],
    ["using", "引数", "パラメータ", "渡し", "changing"],
    ["翻訳", "テキストシンボル", "テキストプール", "多言語"],
    ["日付", "datum", "sy-datum"],
    ["時刻", "uzeit", "sy-uzeit"],
    ["ユーザ", "uname", "実行者"],
    ["小数点", "小数", "小数桁", "decimals", "dec", "パック", "p型", "金額"],
    ["コロン", "連鎖", "chain", "カンマ", "つなげ"],
    ["型枠", "types", "ローカル型", "型だけ"],
    ["シャドウ", "シャドウルール", "ローカル優先", "同名"],
    ["コールスタック", "callstack", "呼出履歴", "呼出階層"],
    ["any", "ジェネリック", "総称型", "typeany"],
    ["raise", "例外発生", "exceptions", "sy-subrc"],
    ["exporting", "importing", "左右", "代入方向"],
  ];

  let catalog = [];
  let activeGroup = "ALL";
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

  function words(str) {
    return toHalfWidth(str)
      .toLowerCase()
      .split(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/)
      .map((w) => w.trim())
      .filter(Boolean);
  }

  function isOperandWord(w) {
    return /_/.test(w) || /^(lt|ls|lv|gv|gt|gs|it|wa|ty|tt|lo|cx|pa|iv|ev|cv|rv)\w*/.test(w);
  }

  function commandWords(syntax) {
    return words(syntax).filter((w) => !isOperandWord(w) && w !== "the");
  }

  function startsWithSeq(hay, needle) {
    if (!needle.length || hay.length < needle.length) return false;
    return needle.every((n, i) => hay[i] === n);
  }

  function consecutiveCommands(synWords, needle) {
    if (!needle.length) return false;
    let n = 0;
    for (const w of synWords) {
      if (isOperandWord(w)) continue;
      if (w === needle[n]) {
        n += 1;
        if (n === needle.length) return true;
      } else if (n > 0) {
        n = w === needle[0] ? 1 : 0;
      }
    }
    return false;
  }

  function queryWords(raw) {
    const parts = words(raw);
    const keepShort = new Set(["to", "of", "by", "at", "in", "is"]);
    return parts.filter((w) => w.length >= 2 || keepShort.has(w));
  }

  function buildCatalog() {
    const src = typeof ABAP_SYNTAX_REF !== "undefined" ? ABAP_SYNTAX_REF : [];
    catalog = src.map((row) => {
      const keywords = Array.isArray(row.keywords) ? row.keywords.slice() : [];
      keywords.push(row.want, row.syntax, row.note, row.group, row.id);
      const searchBlob = normalize(
        [row.want, row.syntax, row.note, row.group, ...(keywords || [])].join(" ")
      );
      return { ...row, keywords, _blob: searchBlob };
    });
  }

  function rankEntry(entry, raw) {
    const q = (raw || "").trim();
    if (!q) return { hit: true, tier: 9, score: 0 };
    const qWords = queryWords(q);
    const qNorm = normalize(q);
    const synWords = words(entry.syntax);
    const cmd = commandWords(entry.syntax);
    const wantWords = words(entry.want);
    const wantN = normalize(entry.want);
    const synN = normalize(entry.syntax);
    const noteN = normalize(entry.note);

    let tier = 9;
    let score = 0;

    if (qWords.length) {
      if (startsWithSeq(cmd, qWords) || startsWithSeq(synWords, qWords)) {
        tier = 0;
        score = 1000 + qWords.length * 20 - cmd.length;
      } else if (consecutiveCommands(synWords, qWords)) {
        tier = 1;
        score = 800 + qWords.length * 20 - cmd.length;
      } else if (startsWithSeq(wantWords, qWords) || consecutiveCommands(wantWords, qWords)) {
        tier = 1;
        score = 700;
      }
    }

    if (qNorm.length >= 3) {
      if (wantN === qNorm) {
        tier = Math.min(tier, 0);
        score = Math.max(score, 1100);
      } else if (wantN.startsWith(qNorm) || synN.startsWith(qNorm)) {
        tier = Math.min(tier, 0);
        score = Math.max(score, 950);
      } else if (wantN.includes(qNorm) || synN.includes(qNorm)) {
        if (tier > 2) {
          tier = 2;
          score = Math.max(score, 350);
        } else {
          score += 80;
        }
      }
    }

    if (tier === 9 && qNorm.length >= 2) {
      const entryWords = new Set(
        words(`${entry.want} ${entry.syntax} ${entry.note}`)
      );
      const synHit = SYNONYMS.some((group) => {
        const norms = group.map(normalize).filter((n) => n.length >= 2);
        if (!norms.includes(qNorm) && !norms.some((n) => n.startsWith(qNorm) && qNorm.length >= 2)) {
          return false;
        }
        return norms.some((n) => {
          if (/^[a-z0-9]+$/.test(n) && n.length <= 4) {
            return entryWords.has(n);
          }
          return (
            entryWords.has(n) ||
            wantN.includes(n) ||
            synN.includes(n) ||
            noteN.includes(n)
          );
        });
      });
      if (synHit) {
        tier = 4;
        score = 50;
      }
    }

    return { hit: tier < 9, tier, score };
  }

  function search(query, groupFilter) {
    const q = (query || "").trim();
    let rows = catalog;
    if (groupFilter && groupFilter !== "ALL") {
      rows = rows.filter((r) => r.group === groupFilter);
    }
    if (!q) return rows;
    const ranked = rows
      .map((r) => ({ r, rank: rankEntry(r, q) }))
      .filter((x) => x.rank.hit);
    if (!ranked.length) return [];
    const best = Math.min(...ranked.map((x) => x.rank.tier));
    const tight = ranked.filter((x) => x.rank.tier <= Math.min(best, 2));
    const used = tight.length ? tight : ranked;
    return used
      .sort(
        (a, b) =>
          a.rank.tier - b.rank.tier ||
          b.rank.score - a.rank.score ||
          a.r.want.localeCompare(b.r.want, "ja")
      )
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

  function renderGroups() {
    const box = document.getElementById("syntax-group-chips");
    if (!box) return;
    const counts = {};
    catalog.forEach((r) => {
      counts[r.group] = (counts[r.group] || 0) + 1;
    });
    const order =
      typeof ABAP_SYNTAX_GROUP_ORDER !== "undefined"
        ? ABAP_SYNTAX_GROUP_ORDER
        : Object.keys(counts);
    const mods = ["ALL", ...order.filter((m) => counts[m])];
    box.innerHTML = mods
      .map((m) => {
        const label = m === "ALL" ? "すべて" : m;
        const count = m === "ALL" ? catalog.length : counts[m] || 0;
        const active = m === activeGroup ? " checked" : "";
        return (
          `<button type="button" class="chip tcode-mod-chip${active}" data-group="${escapeHtml(m)}">` +
          `<span>${escapeHtml(label)}</span>` +
          `<span class="chip-count">${count}</span>` +
          `</button>`
        );
      })
      .join("");
    box.querySelectorAll(".tcode-mod-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeGroup = btn.dataset.group;
        renderGroups();
        renderResults();
      });
    });
  }

  function renderResults() {
    const input = document.getElementById("syntax-search");
    const listEl = document.getElementById("syntax-list");
    const countEl = document.getElementById("syntax-result-count");
    if (!listEl) return;
    const query = input ? input.value : "";
    const rows = search(query, activeGroup);
    if (countEl) {
      countEl.textContent = query.trim()
        ? `${rows.length}件ヒット（全${catalog.length}件中）`
        : `全${rows.length}件`;
    }
    if (rows.length === 0) {
      listEl.innerHTML =
        `<div class="tcode-empty">該当する構文がありません。別の言い回し（例: 「変数を宣言」「余りを取りたい」「デバッグ」）でも試してください。</div>`;
      return;
    }
    listEl.innerHTML = rows
      .map((r) => {
        return (
          `<article class="tcode-item syntax-item">` +
          `<div class="tcode-item-head">` +
          `<span class="syntax-want">${highlight(r.want, query)}</span>` +
          `<span class="tcode-mod-badge">${escapeHtml(r.group)}</span>` +
          `</div>` +
          `<pre class="code-block syntax-code"><code>${highlight(r.syntax, query)}</code></pre>` +
          `<div class="tcode-desc">${highlight(r.note, query)}</div>` +
          `</article>`
        );
      })
      .join("");
  }

  function bind() {
    const input = document.getElementById("syntax-search");
    const clearBtn = document.getElementById("syntax-search-clear");
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
    renderGroups();
    renderResults();
    const input = document.getElementById("syntax-search");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function init() {
    buildCatalog();
    bind();
  }

  return { init, show, search, getCatalog: () => catalog };
})();
