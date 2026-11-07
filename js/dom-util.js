/** DOM / 文字列ユーティリティ */

// ===== ユーティリティ =====
const $ = (id) => document.getElementById(id);

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 直前セッションで出た問題を後ろに回す（プールが足りなければそこから補充）。
 * avoidIds が空なら通常の shuffle と同じ。
 */
/** プール枠（{ entry, forceInputMode }）の問題ID */
function poolSlotId(slot) {
  return slot && slot.entry ? slot.entry.id : slot.id;
}

function orderPoolAvoidingRecent(pool, avoidIds) {
  if (!avoidIds || avoidIds.length === 0) return shuffle(pool);
  const avoid = new Set(avoidIds);
  const fresh = shuffle(pool.filter((slot) => !avoid.has(poolSlotId(slot))));
  const recent = shuffle(pool.filter((slot) => avoid.has(poolSlotId(slot))));
  return fresh.concat(recent);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** QUIZ_DATA を id で引く（結果画面の習得チップ用）。インデックスは app-state の quizEntryById */
function getQuizEntry(id) {
  if (typeof QUIZ_DATA === "undefined") return null;
  if (!quizEntryById) quizEntryById = new Map(QUIZ_DATA.map((q) => [q.id, q]));
  return quizEntryById.get(id) || null;
}

/**
 * 問題文・解説向けの簡易リッチテキスト。
 * - ``` ... ``` → <pre class="code-block">
 * - `inline` → <code class="inline-code">
 * - 改行 → <br>（コードブロック外）
 * 生HTMLは入れず、必ず escape してからタグ付けする。
 */
function formatRichText(s) {
  const raw = String(s ?? "");
  if (!raw) return "";
  const chunks = raw.split(/```(?:[a-zA-Z0-9_+-]*)?\r?\n?([\s\S]*?)```/);
  let html = "";
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] ?? "";
    if (i % 2 === 1) {
      const code = chunk.replace(/\r\n/g, "\n").replace(/\n$/, "");
      html += `<pre class="code-block"><code>${escapeHtml(code)}</code></pre>`;
    } else if (chunk) {
      html += escapeHtml(chunk)
        .replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>')
        .replace(/\r\n|\r|\n/g, "<br>");
    }
  }
  return html;
}

// コード囲みの中身を1行ずつ span で包み、行ごとのぶら下げ字下げを付ける。
//
// なぜ要るか: 擬似言語の塊は携帯の幅に収まらない行を持つ (2026-11-07 の実測で
// 幅360で16問、幅390で7問)。pre をそのまま折り返すと、折り返された続きが
// 左端から始まり、自分の行より浅い位置に出る。擬似言語では字下げが
// そのまま入れ子の深さなので、続きが別の文に見えてしまう。
// 1行を block の span にして、その行自身の先頭の空白の数に3文字足した
// ぶら下げ字下げを掛けると、続きだけが必ず自分の行より右に出る。
//
// 字面の都合: この repo の変更は Slack のパッチの口を通る。口はバック
// クォートを運べないので、テンプレート文字列を使わず、山かっこは
// 文字コードから組む。正規表現も使わない (indexOf と split だけ)。
function wrapCodeLines(html) {
  var LT = String.fromCharCode(60);
  var GT = String.fromCharCode(62);
  var OPEN = LT + 'pre class="code-block"' + GT + LT + 'code' + GT;
  var CLOSE = LT + '/code' + GT + LT + '/pre' + GT;
  var SPAN_CLOSE = LT + '/span' + GT;
  var NL = String.fromCharCode(10);
  var out = "";
  var rest = String(html);
  for (;;) {
    var a = rest.indexOf(OPEN);
    if (a < 0) break;
    var b = rest.indexOf(CLOSE, a + OPEN.length);
    if (b < 0) break;
    var lines = rest.slice(a + OPEN.length, b).split(NL);
    var inner = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var lead = 0;
      while (lead < line.length && line.charAt(lead) === " ") lead++;
      var pad = lead + 3;
      inner += LT + 'span class="code-line" style="padding-left:' + pad +
        "ch;text-indent:-" + pad + 'ch"' + GT + line + SPAN_CLOSE;
    }
    out += rest.slice(0, a) + OPEN + inner + CLOSE;
    rest = rest.slice(b + CLOSE.length);
  }
  return out + rest;
}
