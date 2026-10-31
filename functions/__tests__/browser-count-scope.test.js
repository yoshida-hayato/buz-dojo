//
// Tコード確認 / ABAP構文確認 の件数の行の見張り
// (js/tcode-browser.js / js/syntax-browser.js)。
//
// なぜ要るか (2026-11-01 に Chromium で実測):
//   モジュール (分類) の絞りを掛けたまま検索すると、件数の行の母数だけが
//   全件のままだった。MM の絞りで 受注 を引くと 0件ヒット（全10件中）と出る。
//   MM は4件しか無く、受注 に当たる3件は SD に在る。利用者からは
//   「10件ぜんぶ見たが無い」と読めるので、別の言い回しを試す手が消える。
//   どちらのファイルもテストが1件も無かった。
//
// 見張る約束は4つ:
//   (1) 絞りが掛かっているとき、母数は絞りの中の件数で、絞りの名前が出る
//   (2) 絞りが無いとき (ALL) の文は、直す前と1文字も変わらない
//   (3) 検索語が空のときの文は、直す前と1文字も変わらない
//   (4) 絞りと検索語の両方が効いた行だけが出る (件数と行数が一致する)
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);

// チップは innerHTML で組まれ、そのあと querySelectorAll で押下が結ばれる。
// 押下の経路ごと測りたいので、入れ物は innerHTML からチップを作り直す。
function el() {
  const node = {
    textContent: "",
    innerHTML: "",
    value: "",
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {},
    appendChild() {},
    focus() {},
  };
  let cacheHtml = null;
  let cacheBtns = [];
  node.querySelectorAll = () => {
    const html = String(node.innerHTML || "");
    // 同じ innerHTML なら同じチップを返す。renderModules が結んだ押下を、
    // そのあとの取得でも押せるようにするため
    if (cacheHtml === html) return cacheBtns;
    const quote = String.fromCharCode(34);
    const keys = [];
    ["data-module=", "data-group="].forEach((mark) => {
      let from = html.indexOf(mark + quote);
      while (from !== -1) {
        const head = from + mark.length + 1;
        const tail = html.indexOf(quote, head);
        if (tail === -1) break;
        const key = html.slice(head, tail);
        if (keys.indexOf(key) === -1) keys.push(key);
        from = html.indexOf(mark + quote, tail);
      }
    });
    cacheHtml = html;
    cacheBtns = keys.map((k) => {
      const btn = el();
      btn.dataset.module = k;
      btn.dataset.group = k;
      btn.addEventListener = (type, fn) => {
        if (type === "click") btn.__click = fn;
      };
      return btn;
    });
    return cacheBtns;
  };
  return node;
}

// チップを押す。押下は renderModules が結び直すので、毎回取り直す
function clickChip(box, key) {
  const hit = box.querySelectorAll().find((b) => b.dataset.module === key);
  if (!hit) throw new Error("チップが無い: " + key);
  hit.__click();
}

// 足場そのものの見張り。チップの入れ物が innerHTML を読み落とすと、
// 下の約束が「押していないのに通った」ことになる。先にここを測る。
describe("約束0: チップの足場が innerHTML を読める", () => {
  test("data-module を拾い、同じ innerHTML なら同じチップを返す", () => {
    const box = el();
    const quote = String.fromCharCode(34);
    box.innerHTML =
      "<button data-module=" + quote + "ALL" + quote + "></button>" +
      "<button data-module=" + quote + "MM" + quote + "></button>";
    const first = box.querySelectorAll();
    expect(first.map((b) => b.dataset.module)).toEqual(["ALL", "MM"]);
    expect(box.querySelectorAll()).toBe(first);
  });

  test("innerHTML が変わればチップも作り直される", () => {
    const box = el();
    const quote = String.fromCharCode(34);
    box.innerHTML = "<button data-group=" + quote + "基本" + quote + "></button>";
    expect(box.querySelectorAll().map((b) => b.dataset.group)).toEqual(["基本"]);
    box.innerHTML = "<button data-group=" + quote + "内部テーブル" + quote + "></button>";
    expect(box.querySelectorAll().map((b) => b.dataset.group)).toEqual(["内部テーブル"]);
  });

  test("押下を結んでいないチップを押すと分かる形で落ちる", () => {
    const box = el();
    let threw = false;
    try {
      clickChip(box, "MM");
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

