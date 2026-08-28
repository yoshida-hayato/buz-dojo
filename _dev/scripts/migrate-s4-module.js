/**
 * S4（S/4HANA概要）モジュール廃止 → 共通 / 各モジュールへ再分類
 * 実行: node scripts/migrate-s4-module.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/** @type {Record<string, string>} */
const MODULE_MAP = {
  // --- 共通（プラットフォーム・横断概念） ---
  "s4-01": "共通", "s4-02": "共通", "s4-03": "共通", "s4-04": "共通", "s4-05": "共通",
  "s4-06": "共通", "s4-07": "共通", "s4-08": "共通", "s4-09": "共通", "s4-10": "共通",
  "s4-11": "共通", "s4-12": "共通", "s4-13": "共通", "s4-14": "共通", "s4-15": "共通",
  "s4-29": "共通", "s4-30": "共通", "s4-31": "共通", "s4-32": "共通", "s4-33": "共通",
  "s4-35": "共通",
  "w-07": "共通",
  "s4-41": "共通", "s4-42": "共通", "s4-43": "共通", "s4-54": "共通", "s4-69": "共通",
  "sc-20": "共通", "sc-23": "共通", "sc-26": "共通", "sc-27": "共通", "sc-32": "共通",
  "sc-34": "共通", "sc-35": "共通", "sc-45": "共通", "sc-71": "共通",
  "j-078": "共通", "j-080": "共通", "j-091": "共通", "j-097": "共通", "j-100": "共通",

  // --- GUI ---
  "s4-16": "GUI", "s4-17": "GUI", "s4-18": "GUI", "s4-19": "GUI", "s4-20": "GUI",
  "s4-21": "GUI", "s4-22": "GUI", "s4-23": "GUI", "s4-24": "GUI", "s4-25": "GUI",
  "s4-26": "GUI", "s4-27": "GUI", "s4-28": "GUI",
  "sc-10": "GUI", "sc-33": "GUI", "sc-39": "GUI",

  // --- FI ---
  "w-08": "FI",
  "s4-34": "FI", "s4-45": "FI", "s4-47": "FI", "s4-55": "FI", "s4-63": "FI",
  "s4-85": "FI", "s4-89": "FI", "s4-90": "FI", "s4-91": "FI", "s4-92": "FI",
  "s4-93": "FI", "s4-94": "FI", "s4-95": "FI", "s4-96": "FI", "s4-97": "FI",
  "sc-24": "FI", "sc-38": "FI", "sc-40": "FI", "sc-53": "FI", "sc-69": "FI",
  "sc-70": "FI", "sc-72": "FI", "sc-73": "FI", "sc-76": "FI", "sc-77": "FI",
  "sc-78": "FI", "sc-79": "FI",

  // --- CO ---
  "s4-71": "CO", "s4-82": "CO", "s4-83": "CO", "s4-84": "CO",
  "sc-57": "CO", "sc-58": "CO", "sc-62": "CO",

  // --- MM ---
  "w-09": "MM", "w-10": "MM", "w-11": "MM",
  "s4-44": "MM", "s4-48": "MM", "s4-49": "MM", "s4-50": "MM", "s4-51": "MM",
  "s4-56": "MM", "s4-57": "MM", "s4-58": "MM", "s4-59": "MM", "s4-60": "MM",
  "s4-61": "MM", "s4-62": "MM", "s4-64": "MM", "s4-70": "MM",
  "sc-28": "MM", "sc-29": "MM", "sc-31": "MM", "sc-41": "MM", "sc-43": "MM",
  "sc-46": "MM", "sc-47": "MM", "sc-48": "MM", "sc-49": "MM", "sc-50": "MM",
  "sc-51": "MM", "sc-54": "MM",
  "sc-s4-01": "MM", "sc-s4-02": "MM", "sc-s4-03": "MM", "sc-s4-04": "MM",
  "sc-s4-05": "MM", "sc-s4-06": "MM", "sc-s4-07": "MM",
  "j-079": "MM", "j-108": "MM",

  // --- SD ---
  "w-12": "SD",
  "s4-36": "SD", "s4-37": "SD", "s4-38": "SD", "s4-46": "SD", "s4-52": "SD",
  "s4-86": "SD", "s4-87": "SD", "s4-88": "SD",
  "sc-12": "SD", "sc-25": "SD", "sc-42": "SD", "sc-44": "SD",
  "sc-66": "SD", "sc-67": "SD", "sc-68": "SD", "sc-74": "SD",

  // --- PP ---
  "s4-53": "PP", "s4-65": "PP", "s4-66": "PP", "s4-67": "PP", "s4-68": "PP",
  "s4-72": "PP", "s4-73": "PP", "s4-74": "PP", "s4-75": "PP", "s4-76": "PP",
  "s4-77": "PP", "s4-78": "PP", "s4-79": "PP", "s4-80": "PP", "s4-81": "PP",
  "sc-30": "PP", "sc-52": "PP", "sc-55": "PP", "sc-56": "PP", "sc-59": "PP",
  "sc-60": "PP", "sc-61": "PP", "sc-63": "PP", "sc-64": "PP", "sc-65": "PP",

  // --- HR ---
  "s4-39": "HR", "s4-40": "HR",
};

function migrateFile(filePath, varName) {
  let src = fs.readFileSync(filePath, "utf8");
  const vm = require("vm");
  const sb = { [varName]: [] };
  vm.runInNewContext(
    src.replace(`const ${varName}`, `var ${varName}`).replace(/if \(typeof[\s\S]*$/, ""),
    sb
  );
  const items = sb[varName];
  const s4Items = items.filter((x) => x.module === "S4");
  const unmapped = [];
  for (const item of s4Items) {
    const next = MODULE_MAP[item.id];
    if (!next) {
      unmapped.push(item.id);
      continue;
    }
    const re = new RegExp(`(\\{ id: "${item.id}"[\\s\\S]*?module: )"S4"`);
    if (!re.test(src)) {
      unmapped.push(`${item.id}(regex)`);
      continue;
    }
    src = src.replace(re, `$1"${next}"`);
  }
  fs.writeFileSync(filePath, src);
  return { file: filePath, s4Count: s4Items.length, unmapped };
}

const qResult = migrateFile(path.join(ROOT, "data/questions.js"), "QUIZ_DATA");
const jResult = migrateFile(path.join(ROOT, "data/judgment-questions.js"), "JUDGMENT_DATA");

console.log("questions.js:", qResult);
console.log("judgment-questions.js:", jResult);

// 検証
const vm = require("vm");
const qsrc = fs.readFileSync(path.join(ROOT, "data/questions.js"), "utf8");
const jsrc = fs.readFileSync(path.join(ROOT, "data/judgment-questions.js"), "utf8");
const sb = { QUIZ_DATA: [], JUDGMENT_DATA: [] };
vm.runInNewContext(
  qsrc.replace(/const QUIZ_DATA/, "var QUIZ_DATA").replace(/if \(typeof[\s\S]*$/, "") +
    "\n" +
    jsrc.replace(/const JUDGMENT_DATA/, "var JUDGMENT_DATA"),
  sb
);
const remaining = [...sb.QUIZ_DATA, ...sb.JUDGMENT_DATA].filter((x) => x.module === "S4");
console.log("Remaining S4:", remaining.length, remaining.map((x) => x.id));
const counts = {};
for (const [id, mod] of Object.entries(MODULE_MAP)) {
  counts[mod] = (counts[mod] || 0) + 1;
}
console.log("Map counts:", counts, "total", Object.keys(MODULE_MAP).length);
