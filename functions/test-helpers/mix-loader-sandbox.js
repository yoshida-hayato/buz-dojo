//
// js/subject-loader.js を本物のまま走らせ、科目を3本まで読める足場。
// 試験の中に置くと jest が「試験が1件も無い」で落とすので、ここに置く。
//
// なぜ要るか: ミックス出題は、いま開いている科目を動かさずに別の科目を
// 読む必要がある。loadSubject は SUBJECT / QUIZ_DATA / CHANGELOG /
// 選択中の科目 / loadedId の5つを動かす (2026-11-15 に実測)。
// この足場は、その5つを含む14個を読み書き前後で突き合わせられる。
// 円記号がパッチの口を通らないので、正規表現は1つも使わない。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const LT = String.fromCharCode(60);
const SRC = fs.readFileSync(path.join(ROOT, "js", "subject-loader.js"), "utf8");

// 本番が無いファイルに返す本文。先頭が山かっこであることだけが肝である
const PAGE =
  LT + "!doctype html>" + NL + LT + "html lang=ja>" + NL +
  LT + "body>" + LT + "/body>" + LT + "/html>" + NL;

// この repo に問題データが在る3科目。よそにマスタが在る10科目は手元で読めない
const METAS = [
  { id: "fe-kamoku-a", path: "/subjects/fe-kamoku-a", contentBase: "/data/fe-kamoku-a", enabled: true, questionCount: 46 },
  { id: "fe-kamoku-b", path: "/subjects/fe-kamoku-b", contentBase: "/data/fe-kamoku-b", enabled: true, questionCount: 100 },
  { id: "ap-kamoku-b", path: "/subjects/ap-kamoku-b", contentBase: "/data/ap-kamoku-b", enabled: true, questionCount: 100 },
];

// 科目を読むと動きうる大域の全部。loadSubject が動かす5つはこの中に在る
const WATCH = [
  "SUBJECT", "QUIZ_DATA", "JUDGMENT_DATA", "ORDER_DATA", "CONTRAST_DATA",
  "LEARNING_BACKLOG", "CHANGELOG", "LESSON_DATA", "TCODE_REF",
  "TCODE_MODULE_ORDER", "ABAP_SYNTAX_REF", "ABAP_SYNTAX_GROUP_ORDER",
];

function readFileOrNull(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
function readSubjectCode(id) {
  return readFileOrNull(path.join(ROOT, "subjects", id, "subject.js"));
}
function readDataFile(id, name) {
  return readFileOrNull(path.join(ROOT, "data", id, name));
}
// 道を切る。正規表現を使わずに済ませる
function segments(url) {
  return String(url).split("?")[0].split("/").filter(Boolean);
}

