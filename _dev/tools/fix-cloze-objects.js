#!/usr/bin/env node
/**
 * cloze を1件ずつ「現在のファイルから id を再検索」して差し替える
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const QPATH = path.join(ROOT, "data/questions.js");
const FULL = path.join(ROOT, "tools/_cloze-full.json");
const MIGRATE = path.join(ROOT, "tools/migrate-cloze-code-form.js");

const migrateSrc = fs.readFileSync(MIGRATE, "utf8");
const codeMatch = migrateSrc.match(/const CODE = \{[\s\S]*?\n\};\n/);
const CODE = vm.runInNewContext(codeMatch[0] + "\nCODE;");

function wantOf(q) {
  let p = String(q.prompt || "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  // すでに「〜たい。」がある旧文は、そこまでを採用（一番自然）
  const wantSent = p.match(/^([\s\S]*?たい。)/);
  if (wantSent && !wantSent[1].includes("[[")) return wantSent[1].trim();

  const m = p.match(/^(.*?)[はが]\s*\[\[/s);
  if (m) {
    let w = m[1].replace(/[、\s]+$/u, "").trim();
    w = w.replace(
      /(命令|句|記号|演算子|イベント|キー|Tコード|項目|値|名前|型|宣言|関数|単位|要素|接頭辞|コード|原則|主体|種類|部分|パラメータ|比較記号|終了命令)$/u,
      ""
    );
    w = w.replace(/の$/u, "").replace(/で使う$/u, "").trim();
    if (/たい$/u.test(w)) return w + "。";
    if (/する$/u.test(w)) return w.replace(/する$/u, "したい。");
    if (/める$/u.test(w)) return w.replace(/める$/u, "めたい。");
    if (/く$/u.test(w)) return w.replace(/く$/u, "きたい。");
    if (/る$/u.test(w)) return w.replace(/る$/u, "りたい。");
    if (/とき$/u.test(w)) return w + "、次のコードの穴を埋めたい。";
    if (w.length >= 8) {
      return (w + "したい。").replace(/ししたい/gu, "したい");
    }
  }
  const first = p.split("。")[0];
  if (first && !first.includes("[[") && first.length >= 6) {
    return /[。！？]$/u.test(first) ? first : first + "。";
  }
  return (q.name || "次の処理") + "について、次のコードの穴を埋めたい。";
}

function scrubExp(exp) {
  return String(exp || "")
    .replace(/たとえは[^。]*。/g, "")
    .trim();
}

function filledCode(id, blanks) {
  let c = CODE[id];
  blanks.forEach((b, i) => {
    c = c.split(`[[${i}]]`).join(b.answer);
  });
  return c;
}

function jsLiteral(obj) {
  return JSON.stringify(obj, null, 2);
}

/** Find start of object containing this id (supports { id: "x" and { "id": "x" ) */
function findStart(src, id) {
  const patterns = [
    `{ id: "${id}"`,
    `{ "id": "${id}"`,
    `{\n    "id": "${id}"`,
    `{\n  "id": "${id}"`,
  ];
  let best = -1;
  for (const p of patterns) {
    const i = src.indexOf(p);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  if (best < 0) throw new Error("start not found " + id);
  // walk back to opening brace
  while (best > 0 && src[best] !== "{") best--;
  return best;
}

function findEndAfterStart(src, start) {
  // next object start after this one
  const rest = src.slice(start + 1);
  const m = rest.match(/\n\s*\{[\s\n]*("id"|id):/);
  if (m) return start + 1 + m.index;
  const j = src.indexOf("\nif (typeof JUDGMENT", start);
  if (j > 0) return j;
  const k = src.lastIndexOf("\n]");
  return k;
}

function main() {
  // Restore from a clean approach: take current file, but first try to recover from git if too broken
  // We'll surgically remove }{ artifacts first
  let src = fs.readFileSync(QPATH, "utf8");
  src = src.replace(/\}\{/g, "},\n{");

  src = src.replace(
    /\| "cloze"（穴埋めタップ。prompt=やりたいこと＋```abap コード穴（\[\[0\]\]…）、blanks=\[\{answer,wrongs\[5\]\}\]）\n \*               \|         explanation で完成コードと全体解説。日本語穴あき文だけで終わらせない）/,
    '| "cloze"（穴埋め。prompt=やりたいこと＋abapコード穴[[0]]、blanks。explanationで完成形）'
  );

  const originals = JSON.parse(fs.readFileSync(FULL, "utf8"));
  const rebuilt = originals.map((q) => {
    if (!CODE[q.id]) throw new Error("no CODE " + q.id);
    const want = wantOf(q);
    const code = CODE[q.id];
    const prompt = `${want}\n\n\`\`\`abap\n${code}\n\`\`\``;
    const complete = filledCode(q.id, q.blanks);
    const explanation =
      `穴を埋めた完成形は次のとおり。\n\`\`\`abap\n${complete}\n\`\`\`\n` +
      scrubExp(q.explanation);
    return {
      id: q.id,
      category: "cloze",
      module: q.module || "ABAP",
      code: q.code,
      name: q.name,
      priority: q.priority || 1,
      prompt,
      blanks: q.blanks,
      explanation,
    };
  });

  for (const q of rebuilt) {
    const start = findStart(src, q.id);
    const end = findEndAfterStart(src, start);
    // peek what we're removing end into
    const between = src.slice(start, end);
    // drop trailing commas/whitespace from slice — we'll add comma if next is object
    const nextIsObj = /^\s*\{/.test(src.slice(end));
    const lit = jsLiteral(q);
    src = src.slice(0, start) + lit + (nextIsObj ? ",\n\n" : "\n") + src.slice(end);
  }

  // cleanup double commas
  src = src.replace(/,\s*,/g, ",");
  src = src.replace(/\}\s*,\s*,\s*\{/g, "},\n{");

  fs.writeFileSync(QPATH, src);

  try {
    new Function(src);
    console.log("parse OK");
  } catch (e) {
    console.error("parse FAIL", e.message);
    process.exit(1);
  }

  vm.runInThisContext(src);
  const cloze = QUIZ_DATA.filter((q) => q && q.category === "cloze");
  console.log(
    "cloze",
    cloze.length,
    "with fence",
    cloze.filter((q) => (q.prompt || "").includes("```abap")).length
  );
}

main();
