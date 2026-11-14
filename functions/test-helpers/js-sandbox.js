//
// js の素の1枚を vm で走らせる足場。
//
// なぜ pick が要るか (失敗の型14): 古典 script の最上位の const は大域の
// 語彙環境に入り、window の属性にはならない。だから sandbox.SubjectCatalog は
// undefined になる。最後に名前を式として評価して受け取る。
//
// warns を控えるのは、門の効きが戻り値では区別できない場合が在るためである
// (カタログの件数は、門を外しても外側の catch が同じ値に落とす。
//  区別が付くのは、偽の失敗を記録に残すかどうかだけである)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);

function readJs(name) {
  return fs.readFileSync(path.join(ROOT, "js", name), "utf8");
}

function runIn(sources, extra, pick) {
  const warns = [];
  const sandbox = Object.assign({
    Math, String, Number, Array, Object, JSON, Set, Map, Promise, Date, Function,
    URLSearchParams, encodeURIComponent, Boolean, Error, isNaN, parseInt,
    console: {
      warn: (...a) => warns.push(a.map(String).join(" ")),
      error: () => {},
      log: () => {},
    },
    location: { pathname: "/", search: "", hash: "" },
    sessionStorage: {
      bag: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this.bag, k) ? this.bag[k] : null; },
      setItem(k, v) { this.bag[k] = String(v); },
      removeItem(k) { delete this.bag[k]; },
    },
  }, extra || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  sources.forEach((s) => vm.runInContext(s, ctx));
  const taken = pick ? vm.runInContext("; " + pick + ";", ctx) : null;
  return { ctx, sandbox, taken, warns };
}

module.exports = { runIn, readJs, NL };
