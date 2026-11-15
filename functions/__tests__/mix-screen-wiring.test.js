//
// ミックス出題の画面を、本番の経路に3箇所で繋いだことの見張り。
//
// なぜ要るか。素材 (mix-session / mix-ui / mix-screen と見張り14枚) は
// 2026-11-15 06:48便 までに全部入っていたが、繋ぐ3箇所を出していなかった
// ので、本番では mix- の要素も MixScreen も1つも立たなかった。
// 繋ぎが1つ欠けると、画面は黙って出ないまま通る (素材の見張りは全通する)。
// だから繋ぎそのものを見る。
//
// 3箇所は、面 (index.html) と遅延読込 (js/app.js) と呼び出し
// (js/settings-ui.js) である。読み込む順番も見る。mix-screen は
// MixUI と MixSession を使うので、後ろに在ること。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const HTML = read("index.html");
const APP = read("js/app.js");
const SETTINGS = read("js/settings-ui.js");

function countOf(src, needle) {
  return src.split(needle).length - 1;
}

test("面の要素が、出題設定のカードに在る", () => {
  const ids = ["mix-toggle-btn", "mix-subject-list", "mix-subject-hint", "mix-progress", "mix-start-btn"];
  ids.forEach((id) => {
    expect(countOf(HTML, 'id="' + id + '"')).toBe(1);
  });
});

test("面は、開始ボタンの上に在る", () => {
  // 出題設定を決めてから混ぜる科目を選ぶ順にする。開始ボタンより下に置くと
  // 画面の外に出る (幅390で全頁が3,700pxを超える)。
  const mix = HTML.indexOf('id="mix-toggle-btn"');
  const start = HTML.indexOf('id="start-btn"');
  const count = HTML.indexOf('id="count-select"');
  expect(mix).toBeGreaterThan(-1);
  expect(start).toBeGreaterThan(mix);
  expect(mix).toBeGreaterThan(count);
});

test("3枚が、クイズの道具と一緒に後から読まれる", () => {
  const names = ["js/mix-session.js", "js/mix-ui.js", "js/mix-screen.js"];
  names.forEach((n) => {
    expect(countOf(APP, '"' + n + '"')).toBe(1);
  });
  // index.html が素の script タグで読む形にはしない (最初の画面が重くなる)
  names.forEach((n) => {
    expect(countOf(HTML, n)).toBe(0);
  });
});

test("mix-screen は、MixUI と MixSession より後ろで読む", () => {
  const ui = APP.indexOf('"js/mix-ui.js"');
  const se = APP.indexOf('"js/mix-session.js"');
  const sc = APP.indexOf('"js/mix-screen.js"');
  expect(sc).toBeGreaterThan(ui);
  expect(sc).toBeGreaterThan(se);
});

test("3枚は、クイズの道具をそろえる1箇所で読む", () => {
  // ensureQuizModules の中に在ること。別の口から読むと、出題設定の画面に
  // 入った時点で MixScreen が未定義のまま ensure が呼ばれる。
  const head = APP.indexOf("async function ensureQuizModules()");
  expect(head).toBeGreaterThan(-1);
  const end = APP.indexOf(String.fromCharCode(10) + "}", head);
  const body = APP.slice(head, end);
  expect(body.indexOf('"js/mix-session.js"')).toBeGreaterThan(-1);
  expect(body.indexOf('"js/mix-ui.js"')).toBeGreaterThan(-1);
  expect(body.indexOf('"js/mix-screen.js"')).toBeGreaterThan(-1);
});

test("一覧を描き直す呼び出しが、出題設定の数え直しの頭に在る", () => {
  expect(countOf(SETTINGS, "MixScreen.ensure()")).toBe(1);
  const head = SETTINGS.indexOf("function updatePoolCount() {");
  expect(head).toBeGreaterThan(-1);
  const at = SETTINGS.indexOf("MixScreen.ensure()", head);
  expect(at).toBeGreaterThan(head);
  expect(at - head).toBeLessThan(140);
});

test("呼び出しは、読めていないときに落ちない形で囲ってある", () => {
  // settings-ui は mix-screen より先に読まれうる。素で呼ぶと
  // ReferenceError で出題設定の数え直しが丸ごと止まる。
  const at = SETTINGS.indexOf("MixScreen.ensure()");
  const line = SETTINGS.slice(SETTINGS.lastIndexOf(String.fromCharCode(10), at), at);
  expect(line.indexOf('typeof MixScreen !== "undefined"')).toBeGreaterThan(-1);
});
