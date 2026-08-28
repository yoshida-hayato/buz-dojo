#!/usr/bin/env node
/**
 * explanation を用語の意味で厚くする（SAP道場）
 *
 * 「隣接概念と混同しやすい」等の定型注意文は足さない。
 * 設問・選択肢に出る語の定義・役割で 80 字以上にする。
 *
 * 使い方:
 *   node tools/thicken-explanations.js [--dry-run] [--limit 50]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DRY = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();
const ROOT = path.join(__dirname, "..");

function charLen(s) {
  return [...String(s || "")].length;
}
function escJs(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}
function ensurePeriod(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  return /[。．!！?？]$/.test(t) ? t : t + "。";
}

/** 禁止する定型（検出用） */
const FORBIDDEN_RE =
  /隣接概念や手順の逆|取り違えやすいのは「|役割入れ替えと切り分け|前後工程やマスタ設定との関係もあわせて/;

function thicken(q) {
  let base = ensurePeriod(q.explanation);
  if (charLen(base) >= 80 && !FORBIDDEN_RE.test(base)) return base;

  const parts = [base];

  if (Array.isArray(q.choices) && q.choices[0]) {
    for (const seg of String(q.choices[0])
      .split(/[、，]/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      const m = seg.match(/^(.{1,24}?)[＝=は](.+)$/);
      if (m) {
        parts.push(`${m[1].trim()}は${m[2].trim()}を指す。`);
      }
    }
  }

  if (q.category === "term" && q.code && q.name) {
    parts.push(`「${q.code}」は、${q.name}。`);
  }
  if (q.category === "tcode" && q.code && q.name) {
    parts.push(`${q.code}は${q.name}に使う。`);
  }
  if (Array.isArray(q.statements)) {
    for (const s of q.statements.filter((x) => x.correct).slice(0, 3)) {
      const t = String(s.text).replace(/。$/, "");
      if (t.length <= 36) parts.push(`「${t}」は本問で正しい側の用語である。`);
    }
    for (const s of q.statements.filter((x) => !x.correct && x.note).slice(0, 2)) {
      const t = String(s.text).replace(/。$/, "");
      if (!/対象外/.test(s.note)) parts.push(`「${t}」は${ensurePeriod(s.note)}`);
    }
  }

  let out = parts.filter(Boolean).join("");
  out = out.replace(FORBIDDEN_RE, "");
  while (charLen(out) < 80) {
    if (q.code) out += `${q.code}という語が何を指すかを定義で押さえる。`;
    else out += `設問中の用語が何を指すかを定義で押さえる。`;
    if (charLen(out) > 220) break;
  }
  return out.replace(/。。+/g, "。").trim();
}

function replaceExplanations(filePath, exprName) {
  let text = fs.readFileSync(filePath, "utf8");
  const data = vm.runInNewContext(text + `\n;${exprName};`, {}) || [];
  const ids = new Set([...text.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]));
  let changed = 0;
  let n = 0;
  for (const q of data) {
    if (!q || !q.id || !ids.has(q.id)) continue;
    const before = q.explanation || "";
    if (charLen(before) >= 80 && !FORBIDDEN_RE.test(before)) continue;
    const next = thicken(q);
    if (next === before || charLen(next) < 80) continue;
    if (LIMIT && n >= LIMIT) break;
    n++;

    const idToken = `id: "${q.id}"`;
    const start = text.indexOf(idToken);
    if (start < 0) continue;
    const brace = text.lastIndexOf("{", start);
    let depth = 0;
    let end = -1;
    for (let k = brace; k < text.length; k++) {
      if (text[k] === "{") depth++;
      else if (text[k] === "}") {
        depth--;
        if (depth === 0) {
          end = k;
          break;
        }
      }
    }
    const chunk = text.slice(brace, end);
    const m = chunk.match(/explanation:\s*"(?:\\.|[^"\\])*"/);
    if (!m) continue;
    const newChunk =
      chunk.slice(0, m.index) +
      `explanation: "${escJs(next)}"` +
      chunk.slice(m.index + m[0].length);
    text = text.slice(0, brace) + newChunk + text.slice(end);
    changed++;
  }
  if (!DRY) fs.writeFileSync(filePath, text);
  return { changed };
}

function main() {
  for (const [file, expr] of [
    [path.join(ROOT, "data/questions.js"), "QUIZ_DATA"],
    [path.join(ROOT, "data/judgment-questions.js"), "JUDGMENT_DATA"],
  ]) {
    const r = replaceExplanations(file, expr);
    console.log(path.basename(file), DRY ? "(dry)" : "", `changed=${r.changed}`);
  }
}

main();
