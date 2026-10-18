//
// 版を上げたときに消す控えと、残す控えを分ける。
//
// js/app-chrome.js の clearAppCaches は、更新ボタンを押すたびに
// Cache Storage を全部消していた。いまは Service Worker が無いので
// 入れ物は空で、実害は1つも無い。だが社長の回答 (2026-10-18 13:48便) で
// オフラインに持たせる範囲が「購入した科目の問題データまで」に決まった。
// 問題データは1科目で数MBある (js/subject-loader.js の自分のコメント)。
// 全消しのままで SW を置くと、版を上げるたびに利用者が数十MBを
// 取り直すことになり、しかもその壊れ方は誰にも見えない。
//
// だから分岐だけを先に入れた。見張るのは2つ。
//   1. clearAppCaches が接頭辞で振り分けていること (全消しに戻さない)
//   2. 接頭辞の字面が docs/OFFLINE_DESIGN.md と一致していること。
//      設計の紙と実装がずれると、SW を書く日の自分が別の名前を使い、
//      分岐が効かないまま全消しに戻る
//
// 正規表現は使わない (パッチ経路に量指定子を通せない)。すべて indexOf で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const chrome = read("js/app-chrome.js");
const design = read("docs/OFFLINE_DESIGN.md");

const PREFIX = "bizdojo-offline-";

describe("オフラインの控えは版が上がっても消さない", () => {
  test("接頭辞が js で定義されている", () => {
    expect(chrome.indexOf("OFFLINE_CACHE_PREFIX")).toBeGreaterThan(-1);
    expect(chrome.indexOf('const OFFLINE_CACHE_PREFIX = "' + PREFIX + '"')).toBeGreaterThan(-1);
  });

  test("clearAppCaches が接頭辞で振り分けている", () => {
    const from = chrome.indexOf("async function clearAppCaches()");
    expect(from).toBeGreaterThan(-1);
    const to = chrome.indexOf("async function forceAppReloadWithVersion");
    expect(to).toBeGreaterThan(from);
    const body = chrome.slice(from, to);
    // 接頭辞で始まらないものだけを消す
    expect(body.indexOf("OFFLINE_CACHE_PREFIX")).toBeGreaterThan(-1);
    expect(body.indexOf("caches.delete")).toBeGreaterThan(-1);
    // keys をそのまま全部消す形に戻っていないこと
    expect(body.indexOf("keys.map((k) => caches.delete(k))")).toBe(-1);
  });

  test("設計の紙と実装の字面が一致している", () => {
    expect(design.indexOf(PREFIX)).toBeGreaterThan(-1);
    expect(design.indexOf("OFFLINE_CACHE_PREFIX")).toBeGreaterThan(-1);
  });
});
