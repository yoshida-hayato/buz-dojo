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

//
// opts:
//   source    … 走らせる subject-loader.js の字面 (壊し方の確かめで使う)
//   pageFor   … この一覧に在る道には、200 で頁を返す (例: subject.js)
//   missing   … この一覧に在る道には、ok が偽を返す
//
function load(opts) {
  const o = opts || {};
  const source = o.source || SRC;
  const pageFor = o.pageFor || [];
  const missing = o.missing || [];
  const fetched = [];

  function bodyFor(url) {
    const seg = segments(url);
    if (seg[0] === "data" && seg.length >= 3) {
      return readDataFile(seg[1], seg.slice(2).join("/"));
    }
    if (seg[0] === "subjects" && seg.length >= 3) {
      return readSubjectCode(seg[1]);
    }
    return null;
  }

  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set, Map, Promise, Date, Function,
    URLSearchParams, encodeURIComponent, Boolean, Error, isNaN, parseInt, RegExp,
    console: { warn: () => {}, error: () => {}, log: () => {} },
    APP_VERSION: "test",
    SUBJECT_REGISTRY: METAS.slice(),
    localStorage: {
      bag: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this.bag, k) ? this.bag[k] : null; },
      setItem(k, v) { this.bag[k] = String(v); },
      removeItem(k) { delete this.bag[k]; },
    },
    location: { pathname: "/", search: "", hash: "" },
  };

  sandbox.fetch = async (url) => {
    const bare = String(url).split("?")[0];
    fetched.push(bare);
    if (missing.indexOf(bare) !== -1) return { ok: false, text: async () => "" };
    if (pageFor.indexOf(bare) !== -1) return { ok: true, text: async () => PAGE };
    const body = bodyFor(bare);
    if (body === null) return { ok: false, text: async () => "" };
    return { ok: true, text: async () => body };
  };

  // 自前の subject.js だけが script タグで入る。本番と同じく、
  // 読み込みが済んだ時点で SUBJECT が大域に立つ
  sandbox.document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: {
      appendChild: (el) => {
        const bare = String(el && el.src).split("?")[0];
        const seg = segments(bare);
        if (seg[0] === "subjects" && seg[2] === "subject.js") {
          const code = readSubjectCode(seg[1]);
          sandbox.SUBJECT = new Function(code + NL + ";return SUBJECT;")();
        }
        if (el && el.onload) el.onload();
      },
    },
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const api = vm.runInContext(source + NL + "; SubjectLoader;", ctx);
  return { api, win: sandbox, fetched };
}

// 見張る14個 (大域12 + 選択中の科目 + loadedId) を1つの字に畳む
function snapshot(bag) {
  const win = bag.win;
  const out = {};
  WATCH.forEach((n) => {
    const v = win[n];
    if (typeof v === "undefined") { out[n] = "undefined"; return; }
    out[n] = (Array.isArray(v) ? "len=" + v.length + ":" : "obj:") + JSON.stringify(v).length;
  });
  out.selected = win.localStorage.getItem("biz_dojo_selected_subject");
  out.loadedId = bag.api.getLoadedId();
  return JSON.stringify(out);
}

module.exports = { load, snapshot, SRC, PAGE, METAS, WATCH, NL };
