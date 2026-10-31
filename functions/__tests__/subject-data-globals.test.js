//
// 科目を切り替えたときに、前の科目のデータが残らないことの見張り
// (js/subject-loader.js)。
//
// なぜ要るか (2026-11-01 に Chromium で実測):
//   changelog.js / lesson.js / tcodes.js / abap-syntax.js はよその repo の
//   マスタで、宣言の書き方がそろっていない。SAP の changelog.js は
//   const CHANGELOG で、学習道場の9科目は var CHANGELOG である。
//   これを script タグで読むと、2度目の読み込みが
//   Identifier CHANGELOG has already been declared で台本ごと落ちる。
//   しかも script の onload は成功として返るので、こちらのコードは
//   失敗に気づかない。さらに const は window の属性ではないため、
//   clearGlobals の window.CHANGELOG = undefined が当たらない。
//   実測した壊れ方: SAP を見たあとに Excel関数へ移ると、ベルの更新履歴が
//   SAP の 2件 (Tコード問題を追加) のまま残り、Excel の1件が出なかった。
//
// 見張る約束は5つ:
//   (1) データ台本は大域に名前を作らない (const でも2度読める)
//   (2) 2度目の読み込みが前の値を必ず上書きする
//   (3) 台本に無い名前は undefined のまま window に書かない
//   (4) clearGlobals が、画面が読む名前をすべて消す
//   (5) 読む側の名前と消す側の名前が一致している (ABAP_SYNTAX の綴り違いの再発防止)
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const SRC = fs.readFileSync(path.join(ROOT, "js", "subject-loader.js"), "utf8");

// window は sandbox の大域そのものにする。ブラウザでは window === globalThis
// なので、window.X への代入が素の X として読めることまで含めて測りたい。
function load(fetchImpl) {
  const injected = [];
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set, Map, Promise, Date, Function,
    URLSearchParams,
    encodeURIComponent,
    console: { warn: () => {}, error: () => {} },
    fetch: fetchImpl,
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
          injected.push(String(el && el.src));
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

// 足場そのものの見張り。sandbox の window が大域でないと、window.X への
// 代入が素の X として読めず、下の約束が本物の壊れ方を測れない。
describe("約束0: 足場の window が大域そのものである", () => {
  test("window.X への代入が素の X として読める", () => {
    const { api, win } = load(async () => ({ ok: false, text: async () => "" }));
    expect(typeof api).toBe("object");
    win.PROBE_VALUE = 7;
    expect(win.window.PROBE_VALUE).toBe(7);
    expect(win.globalThis).toBe(win);
  });
});

