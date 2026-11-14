//
// js/subject-loader.js を本物のまま走らせる足場。
// 試験の中に置くと jest が「試験が1件も無い」で落とすので、ここに置く。
//
// なぜ要るか: 2026-11-09 に社長が本番で踏んだ壊れ方は、fetch が
// 「ok が真で、中身が頁」を返す経路だった。1,086件の試験はこの3通り目を
// 1度も作っていなかった。makeFetch の第2引数がそれを作る口である。
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
  LT + "!doctype html>" + NL +
  LT + "html lang=ja>" + NL +
  LT + "head>" + LT + "/head>" + NL +
  LT + "body>" + LT + "/body>" + LT + "/html>" + NL;

const REAL_QUESTIONS =
  "var QUIZ_DATA = [" + NL +
  '  { id: "q1", question: "1たす1", choices: ["1", "2"], answer: 1 },' + NL +
  '  { id: "q2", question: "2たす2", choices: ["3", "4"], answer: 1 }' + NL +
  "];" + NL;

const REAL_JUDGMENT =
  'var JUDGMENT_DATA = [{ id: "j1", question: "真か偽か", answer: true }];' + NL;

const META = {
  id: "fe-kamoku-b",
  path: "/subjects/fe-kamoku-b",
  contentBase: "/data/fe-kamoku-b",
  enabled: true,
  questionCount: 100,
};

// 渡した表の鍵 (ファイル名) で当たった本文を 200 で返す。
// 表に無い道は missingBody を 200 で返す。null を渡したときだけ ok を偽にする
function makeFetch(bodyByTail, missingBody) {
  const calls = [];
  const impl = async (url) => {
    const bare = String(url).split("?")[0];
    calls.push(bare);
    const tail = bare.split("/").pop();
    if (Object.prototype.hasOwnProperty.call(bodyByTail, tail)) {
      return { ok: true, text: async () => bodyByTail[tail] };
    }
    if (missingBody === null) return { ok: false, text: async () => "" };
    return { ok: true, text: async () => missingBody };
  };
  impl.calls = calls;
  return impl;
}

// window は sandbox の大域そのものにする。ブラウザでは window === globalThis
// なので、window.X への代入が素の X として読めることまで含めて測りたい
function load(fetchImpl) {
  const injected = [];
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set, Map, Promise, Date, Function,
    URLSearchParams, encodeURIComponent, Boolean, Error, isNaN, parseInt,
    console: { warn: () => {}, error: () => {}, log: () => {} },
    fetch: fetchImpl,
    APP_VERSION: "test",
    SUBJECT_REGISTRY: [META],
    localStorage: {
      bag: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this.bag, k) ? this.bag[k] : null; },
      setItem(k, v) { this.bag[k] = String(v); },
      removeItem(k) { delete this.bag[k]; },
    },
    location: { pathname: "/", search: "", hash: "" },
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: {
        appendChild: (el) => {
          const src = String(el && el.src);
          injected.push(src);
          // 自前の subject.js だけが script タグで入る。本番と同じく、
          // 読み込みが済んだ時点で SUBJECT が大域に立つ
          if (src.indexOf("subject.js") !== -1) {
            sandbox.SUBJECT = { id: META.id, title: "科目B" };
          }
          if (el && el.onload) el.onload();
        },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const api = vm.runInContext(SRC + NL + "; SubjectLoader;", ctx);
  return { api, win: sandbox, injected };
}

module.exports = { load, makeFetch, PAGE, REAL_QUESTIONS, REAL_JUDGMENT, META, NL, SRC };
