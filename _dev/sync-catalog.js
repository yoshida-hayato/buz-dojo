#!/usr/bin/env node
/**
 * 各マスタの問題数を数え、catalog.js と config/pricing.js を更新する。
 *
 * 使い方（ビジネス道場）:
 *   node _dev/sync-catalog.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PERSONAL = path.resolve(ROOT, "..");

function evalLen(code, varName) {
  return new Function(
    code + `; return typeof ${varName} !== "undefined" && Array.isArray(${varName}) ? ${varName}.length : 0;`
  )();
}

function readIfExists(filePath, fallback = "") {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : fallback;
}

/** 科目マスタの全形式合算（QUIZ+JUDGMENT+ORDER+CONTRAST）。連結前提にしない。
 *  各ファイルを単独評価する（questions.js の push 連結で二重計上しない）。
 */
function evalSubjectTotal(baseDir) {
  const parts = [
    ["questions.js", "QUIZ_DATA"],
    ["judgment-questions.js", "JUDGMENT_DATA"],
    ["order-questions.js", "ORDER_DATA"],
    ["contrast-questions.js", "CONTRAST_DATA"],
  ];
  let total = 0;
  for (const [file, varName] of parts) {
    const code = readIfExists(path.join(baseDir, file));
    if (!code) continue;
    total += evalLen(code, varName);
  }
  return total;
}

function evalSapBundleCount() {
  const base = path.join(PERSONAL, "SAPクイズ/data");
  const j = fs.readFileSync(path.join(base, "judgment-questions.js"), "utf8");
  const q = fs.readFileSync(path.join(base, "questions.js"), "utf8");
  const code = j + "\n" + q;
  // SAPは questions.js 側で JUDGMENT を連結する想定。無い場合は合算にフォールバック。
  const quiz = evalLen(code, "QUIZ_DATA");
  const judg = evalLen(code, "JUDGMENT_DATA");
  return quiz > 0 ? quiz : judg;
}

const today = new Date().toISOString().slice(0, 10);

const counts = {
  sap: evalSapBundleCount(),
  "windows-shortcuts": evalSubjectTotal(
    path.join(PERSONAL, "学習道場/subjects/windows-shortcuts")
  ),
  "biz-career": evalSubjectTotal(path.join(PERSONAL, "学習道場/subjects/biz-career")),
  "biz-pm-planning": evalSubjectTotal(
    path.join(PERSONAL, "学習道場/subjects/biz-pm-planning")
  ),
  "biz-pm-operation": evalSubjectTotal(
    path.join(PERSONAL, "学習道場/subjects/biz-pm-operation")
  ),
  "excel-functions": evalSubjectTotal(
    path.join(PERSONAL, "学習道場/subjects/excel-functions")
  ),
  "outlook-mail": evalSubjectTotal(path.join(PERSONAL, "学習道場/subjects/outlook-mail")),
  "teams-collab": evalSubjectTotal(path.join(PERSONAL, "学習道場/subjects/teams-collab")),
  "ai-ontology-intro": evalSubjectTotal(
    path.join(PERSONAL, "学習道場/subjects/ai-ontology-intro")
  ),
  "ai-ontology-core": evalSubjectTotal(
    path.join(PERSONAL, "学習道場/subjects/ai-ontology-core")
  ),
};

function writeCatalog(filePath, count) {
  const body =
    "/**\n" +
    " * 問題数カタログ（軽量・ビジネス道場が料金・一覧表示に使用）\n" +
    " * 自動生成: node _dev/sync-catalog.js\n" +
    " */\n" +
    "var SUBJECT_CONTENT_CATALOG = {\n" +
    `  questionCount: ${count},\n` +
    `  updatedAt: "${today}",\n` +
    "};\n";
  fs.writeFileSync(filePath, body, "utf8");
}

writeCatalog(path.join(PERSONAL, "SAPクイズ/data/catalog.js"), counts.sap);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/windows-shortcuts/catalog.js"),
  counts["windows-shortcuts"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/biz-career/catalog.js"),
  counts["biz-career"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/biz-pm-planning/catalog.js"),
  counts["biz-pm-planning"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/biz-pm-operation/catalog.js"),
  counts["biz-pm-operation"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/excel-functions/catalog.js"),
  counts["excel-functions"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/outlook-mail/catalog.js"),
  counts["outlook-mail"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/teams-collab/catalog.js"),
  counts["teams-collab"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/ai-ontology-intro/catalog.js"),
  counts["ai-ontology-intro"]
);
writeCatalog(
  path.join(PERSONAL, "学習道場/subjects/ai-ontology-core/catalog.js"),
  counts["ai-ontology-core"]
);

const pricingPath = path.join(ROOT, "config/pricing.js");
let pricing = fs.readFileSync(pricingPath, "utf8");
for (const [id, count] of Object.entries(counts)) {
  const key = id.includes("-") ? `"${id}"` : id;
  const re = new RegExp(`(${key}:\\s*\\{[\\s\\S]*?questionCount:\\s*)\\d+`);
  pricing = pricing.replace(re, `$1${count}`);
}
fs.writeFileSync(pricingPath, pricing, "utf8");

console.log("catalog synced:", counts);
