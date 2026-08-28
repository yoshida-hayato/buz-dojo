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
