#!/usr/bin/env node
/**
 * 選択肢・問題文の品質監査ツール（SAP道場）
 *
 * 目的: 問題を追加・修正したら、デプロイ前に必ず実行してヒット0にする。
 *   - 括弧メタ読み: scenario/term の choices、judgment 複数の statements で
 *     正解側だけに（）/() があり誤答側に無い → NG。全選択肢にあるなら可。
 *   - 断定語メタ読み: scenario/term の choices、および judgment 複数選択の statements
 *     で、断定語が誤答（correct:false）にあり正解（correct:true）に無い
 *     → 1件でも「極端な誤答を消す」だけで解けるので NG。
 *     ※「表示のみ」は項目ステータス用語として断定語から除外。
 *   - 正解だけ長い: 正解が誤答最大より +8字以上（または平均*1.4+6以上）長い。
 *   - メタ表現: 問題番号（j-321 等）や「スライド」「資料のとおり」など、
 *     学習者向けでない参照を name/explanation/choices/statements に書かない。
 *   - 選択肢の「。」: scenario の choices / judgment 複数の statements[].text に「。」を書かない。
 *   - 語尾リーク: judgment 複数で、正解側の語尾族と誤答側の語尾族が完全分離していると
 *     文末だけで正誤がばれる（例: 正解がすべて「〜こと」、誤答がすべて「〜できる」）。
 *   - 壊れた否定: judgment 複数の誤記述が「真文＋ない」（例: 基準日レートない／
 *     転記されるない）や、note を末尾に「ない」付けしただけの残骸。
 *
 * 使い方: node tools/audit-choices.js
 *   ヒットが1件でもあれば exit code 1（デプロイ前ゲートとして使う）。
 */
const vm = require("vm");
const fs = require("fs");
const path = require("path");

// 断定語: 正解に無く誤答だけにあると「極端な言い切りを消す」だけで解ける（1件でも NG）
const TELLS = [
  "絶対", "必ず", "常に", "一切", "決して", "例外なく", "唯一",
  "だけ", "のみ", "すべて", "全て", "全部",
  "しかない", "だけで", "に限る", "以外は",
];

// 学習者向け問題に出してはいけないメタ表現
// 「テキストの言語」「表示テキストの」など正当な用語は除外するため、
// 「テキストで／テキストに〜」のメタ参照形だけを拾う。
const META_PHRASES = [
  "スライド",
  "テキストであった",
  "テキストにあった",
  "テキストに書",
  "テキストのとおり",
  "テキストでは",
  "テキストで",
  "資料の対比",
  "資料のとおり",
  "資料の流れ",
  "資料では",
  "講義資料",
  "講義スライド",
  "今回スライド",
  "メモに",
  "バックログ",
  "上記の図",
  "次の図",
  "この図",
  "教材",
  "公式",
  "図中の",
  "図より",
  "図に示",
  "図上の",
  "図の例",
  "図の会社",
];

// 「指図では／指図の／組織図／管理図／構図」などを誤検知しない図参照
const META_FIGURE_RE =
  /(?:^|[^指計管組工配流])図では|(?:^|[^指計管組工配流パ])図の(?:例|会社|割当|シナリオ|ケース|対応)/;

// 問題ID参照（例: j-321, sc-pp-48, pp-25, ab-49, mm-02, sd-51, sc-mm-30, s4-24）
// 自IDは除外。Tコード（ME21N等）や「テキストの」にはマッチしない。
const ID_REF_RE =
  /\b(?:j|sc-(?:pp|mm|sd|fi|co|hr)|pp|mm|sd|fi|co|hr|ab|s4|w|s)-\d+[a-z0-9-]*\b/i;

const FILES = [
  path.join(__dirname, "..", "data", "questions.js"),
  path.join(__dirname, "..", "data", "judgment-questions.js"),
];

function tellsIn(str) {
  // 「表示のみ」は項目ステータスの正式用語（だけ／のみのワラ人形ではない）
  const s = String(str).replace(/表示のみ/g, "表示可変更不可");
  return TELLS.filter((w) => s.includes(w));
}
function len(s) {
  return [...String(s)].length;
}
/** 文末だけで正誤がばれる語尾族 */
function endingBucket(t) {
  const s = String(t).trim();
  if (/こと$/.test(s)) return "こと";
  if (/である$/.test(s)) return "である";
  if (/できない$/.test(s)) return "できない";
  if (/できる$/.test(s)) return "できる";
  if (/直せる$|変えられる$|修正できる$|書ける$/.test(s)) return "可能系";
  if (/される$/.test(s)) return "される";
  if (/する$/.test(s)) return "する";
  if (/ない$/.test(s)) return "ない";
  if (/ある$/.test(s)) return "ある";
  if (/いる$/.test(s)) return "いる";
  if (/のみ$/.test(s)) return "のみ";
  if (/だ$/.test(s)) return "だ";
  if (/です$/.test(s)) return "です";
  const last = [...s].slice(-1)[0] || "";
  return "末:" + last;
}
function dominantEnding(texts) {
  const buckets = {};
  for (const t of texts) {
    const b = endingBucket(t);
    buckets[b] = (buckets[b] || 0) + 1;
  }
  return Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a])[0];
}
function load(file) {
  const src = fs.readFileSync(file, "utf8");
  // questions.js は QUIZ_DATA、judgment は JUDGMENT_DATA
  return vm.runInNewContext(
    src +
      "\n; (typeof QUIZ_DATA !== 'undefined' ? QUIZ_DATA : typeof JUDGMENT_DATA !== 'undefined' ? JUDGMENT_DATA : []);",
    {}
  ) || [];
}

function collectTextFields(q) {
  const parts = [];
  if (q.name) parts.push(["name", q.name]);
  if (q.explanation) parts.push(["explanation", q.explanation]);
  if (q.code && q.category === "judgment" && q.statements && q.name) {
    // name がある複数選択は code は内部ラベルなのでスキップ可
  } else if (q.code && (q.category === "judgment" || q.category === "scenario")) {
    parts.push(["code", q.code]);
  }
  if (Array.isArray(q.choices)) {
    q.choices.forEach((c, i) => parts.push([`choices[${i}]`, c]));
  }
  if (Array.isArray(q.statements)) {
    q.statements.forEach((s, i) => {
      if (s && s.text) parts.push([`statements[${i}]`, s.text]);
      if (s && s.note) parts.push([`statements[${i}].note`, s.note]);
    });
  }
  return parts;
}

let tellHits = [];
let parenHits = [];
let lenHits = [];
let metaHits = [];
let periodHits = [];
let endingHits = [];
let brokenNaiHits = [];
let scanned = 0;
const seenIds = new Set();

/** 真文に「ない」を付けただけの壊れた誤記述か */
function isBrokenNai(text, note) {
  const t = String(text || "").trim();
  const n = String(note || "").trim();
  if (!t.includes("ない")) return false;
  if (n && t === n + "ない") return true;
  if (/得るない$|やすいない$|られるない$|されるない$|するない$|あるない$|いるない$/.test(t)) {
    return true;
  }
  // 項目名など体言止めに「ない」だけ付けた残骸（正式な否定文末は除外）
  const without = t.replace(/ない$/, "");
  if (n && without === n) {
    const okNeg =
      /(しない|できない|ではない|されない|持てない|使わない|含まれない|対応しない|存在しない|表せない|表さない|示さない|持たない|省略できない|更新されない|転記されない|定義しない|起動しない|設定しない|可能ではない)$/.test(
        t
      );
    if (!okNeg) return true;
  }
  return false;
}

function hasParen(s) {
  return /[（(]/.test(String(s));
}

for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const data = load(file);
  for (const q of data) {
    if (!q || !q.id || seenIds.has(q.id)) continue;
    seenIds.add(q.id);

    // 選択肢の「。」禁止（choices / statements[].text）
    if (Array.isArray(q.choices)) {
      q.choices.forEach((c, i) => {
        if (String(c).includes("。")) {
          periodHits.push({ id: q.id, code: q.code || "", field: `choices[${i}]` });
        }
      });
    }
    if (Array.isArray(q.statements)) {
      q.statements.forEach((s, i) => {
        if (s && s.text && String(s.text).includes("。")) {
          periodHits.push({ id: q.id, code: q.code || "", field: `statements[${i}]` });
        }
        if (s && s.correct === false && isBrokenNai(s.text, s.note)) {
          brokenNaiHits.push({
            id: q.id,
            code: q.code || "",
            field: `statements[${i}]`,
            text: String(s.text).slice(0, 60),
          });
        }
      });
      // 語尾リーク: 正解族と誤答族が完全分離
      if (q.statements.length >= 4) {
        const correct = q.statements.filter((s) => s && s.correct && s.text);
        const wrong = q.statements.filter((s) => s && !s.correct && s.text);
        if (correct.length >= 2 && wrong.length >= 2) {
          const cDom = dominantEnding(correct.map((s) => s.text));
          const wDom = dominantEnding(wrong.map((s) => s.text));
          const cPure = correct.every((s) => endingBucket(s.text) === cDom);
          const wPure = wrong.every((s) => endingBucket(s.text) === wDom);
          if (cPure && wPure && cDom !== wDom) {
            endingHits.push({
              id: q.id,
              code: q.code || "",
              cDom,
              wDom,
            });
          }
        }
      }
    }

    // メタ表現・問題番号: 全カテゴリ
    for (const [field, text] of collectTextFields(q)) {
      const hits = [];
      for (const p of META_PHRASES) {
        if (String(text).includes(p)) hits.push(p);
      }
      if (META_FIGURE_RE.test(String(text))) {
        hits.push("図参照");
      }
      const idMatches = String(text).match(new RegExp(ID_REF_RE.source, "gi")) || [];
      for (const m of idMatches) {
        if (m.toLowerCase() === String(q.id).toLowerCase()) continue; // 自IDは無視
        hits.push(m);
      }
      if (hits.length) {
        metaHits.push({
          id: q.id,
          code: q.code || "",
          field,
          words: [...new Set(hits)],
        });
      }
    }

    // 断定語・長さ: scenario / term の choices
    if (
      Array.isArray(q.choices) &&
      q.choices.length >= 3 &&
      (q.category === "scenario" || q.category === "term")
    ) {
      scanned += 1;
      const correct = q.choices[0];
      const wrongs = q.choices.slice(1);

      const correctTellCount = tellsIn(correct).length;
      const wrongsWithTell = wrongs.filter((w) => tellsIn(w).length > 0);
      if (correctTellCount === 0 && wrongsWithTell.length >= 1) {
        const words = [...new Set(wrongsWithTell.flatMap((w) => tellsIn(w)))];
        tellHits.push({
          id: q.id,
          code: q.code,
          words,
          hit: wrongsWithTell.length,
          total: wrongs.length,
          kind: "choice",
        });
      }

      if (hasParen(correct) && !wrongs.some(hasParen)) {
        parenHits.push({
          id: q.id,
          code: q.code,
          kind: "choice",
          sample: String(correct).slice(0, 40),
        });
      }

      const cl = len(correct);
      const maxWrong = Math.max(...wrongs.map(len));
      const avgWrong = wrongs.reduce((a, b) => a + len(b), 0) / wrongs.length;
      if (cl - maxWrong >= 8 || cl >= avgWrong * 1.4 + 6) {
        lenHits.push({
          id: q.id,
          code: q.code,
          correctLen: cl,
          maxWrongLen: maxWrong,
          avgWrongLen: Math.round(avgWrong),
        });
      }
    }

    // 断定語: judgment 複数選択の statements（correct:true=正しい記述）
    if (Array.isArray(q.statements) && q.statements.length >= 2) {
      scanned += 1;
      const truths = q.statements.filter((s) => s && s.text && s.correct);
      const falses = q.statements.filter((s) => s && s.text && !s.correct);
      if (truths.length && falses.length) {
        const truthHasTell = truths.some((s) => tellsIn(s.text).length > 0);
        const falsesWithTell = falses.filter((s) => tellsIn(s.text).length > 0);
        if (!truthHasTell && falsesWithTell.length >= 1) {
          const words = [...new Set(falsesWithTell.flatMap((s) => tellsIn(s.text)))];
          tellHits.push({
            id: q.id,
            code: q.code || "",
            words,
            hit: falsesWithTell.length,
            total: falses.length,
            kind: "statement",
          });
        }
        const truthHasParen = truths.some((s) => hasParen(s.text));
        const falseHasParen = falses.some((s) => hasParen(s.text));
        if (truthHasParen && !falseHasParen) {
          parenHits.push({
            id: q.id,
            code: q.code || "",
            kind: "statement",
            sample: truths.find((s) => hasParen(s.text)).text.slice(0, 40),
          });
        }
      }
    }
  }
}

console.log(`監査対象: scenario/term/judgment複数 ${scanned}問（メタ検査は全問題）`);
console.log(`\n【断定語メタ読み（誤答≥1が断定語・正解0）】 ${tellHits.length}問`);
for (const h of tellHits) {
  console.log(
    `  ${h.id} [${h.code}] (${h.kind || "?"}) 断定語=${h.words.join("/")} 該当誤答=${h.hit}/${h.total}`
  );
}
console.log(`\n【括弧メタ読み（正解側のみに括弧・誤答0）】 ${parenHits.length}問`);
for (const h of parenHits) {
  console.log(`  ${h.id} [${h.code}] (${h.kind}) ${h.sample}`);
}
console.log(`\n【正解だけ長い（+8字以上）】 ${lenHits.length}問`);
for (const h of lenHits) {
  console.log(
    `  ${h.id} [${h.code}] 正解=${h.correctLen} 誤答最大=${h.maxWrongLen} 誤答平均=${h.avgWrongLen}`
  );
}
console.log(`\n【メタ表現・問題番号】 ${metaHits.length}件`);
for (const h of metaHits) {
  console.log(`  ${h.id} [${h.code}] ${h.field}: ${h.words.join(", ")}`);
}
console.log(`\n【選択肢の「。」】 ${periodHits.length}件`);
for (const h of periodHits.slice(0, 40)) {
  console.log(`  ${h.id} [${h.code}] ${h.field}`);
}
if (periodHits.length > 40) console.log(`  …他 ${periodHits.length - 40}件`);

console.log(`\n【語尾リーク（正解族≠誤答族の完全分離）】 ${endingHits.length}件`);
for (const h of endingHits) {
  console.log(`  ${h.id} [${h.code}] 正解=${h.cDom} / 誤答=${h.wDom}`);
}

console.log(`\n【壊れた否定（真文＋ない）】 ${brokenNaiHits.length}件`);
for (const h of brokenNaiHits.slice(0, 40)) {
  console.log(`  ${h.id} [${h.code}] ${h.field}: ${h.text}`);
}
if (brokenNaiHits.length > 40) console.log(`  …他 ${brokenNaiHits.length - 40}件`);

const total =
  tellHits.length +
  parenHits.length +
  lenHits.length +
  metaHits.length +
  periodHits.length +
  endingHits.length +
  brokenNaiHits.length;
console.log(
  `\n${total === 0 ? "OK: ヒットなし。デプロイ可。" : "NG: " + total + "件を修正してください。"}`
);
process.exit(total === 0 ? 0 : 1);
