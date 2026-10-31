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

function load(file, name, globals) {
  const nodes = {};
  const sandbox = Object.assign(
    {
      Math, String, Number, Array, Object, JSON, Set, Map, RegExp, Date,
      console: { warn: () => {}, error: () => {} },
      setTimeout: (fn) => { if (typeof fn === "function") fn(); return 0; },
      clearTimeout: () => {},
      escapeHtml: (s) => String(s === undefined || s === null ? "" : s),
      document: {
        getElementById: (id) => {
          if (!nodes[id]) nodes[id] = el();
          return nodes[id];
        },
        addEventListener() {},
      },
    },
    globals
  );
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(ROOT, "js", file), "utf8");
  const api = vm.runInContext(src + NL + "; " + name + ";", ctx);
  return { api, nodes };
}

const TCODES = [
  { code: "VA01", module: "SD", name: "受注伝票の登録", description: "受注伝票を登録する" },
  { code: "VA02", module: "SD", name: "受注伝票の変更", description: "受注伝票を変更する" },
  { code: "VA03", module: "SD", name: "受注伝票の照会", description: "受注伝票を照会する" },
  { code: "VL01N", module: "SD", name: "出荷伝票の登録", description: "出荷伝票を登録する" },
  { code: "ME21N", module: "MM", name: "購買発注の登録", description: "購買発注を登録する" },
  { code: "ME22N", module: "MM", name: "購買発注の変更", description: "購買発注を変更する" },
  { code: "MIGO", module: "MM", name: "入出庫処理", description: "入庫と出庫を処理する" },
  { code: "MMBE", module: "MM", name: "在庫照会", description: "在庫を照会する" },
  { code: "FB01", module: "FI", name: "仕訳伝票の登録", description: "仕訳伝票を登録する" },
  { code: "FB03", module: "FI", name: "仕訳伝票の照会", description: "仕訳伝票を照会する" },
];

const SYNTAX = [
  { id: "a1", group: "基本", want: "変数を宣言したい", syntax: "DATA lv_x TYPE i.", note: "宣言する" },
  { id: "a2", group: "基本", want: "定数を置きたい", syntax: "CONSTANTS lc_x TYPE i VALUE 1.", note: "固定値" },
  { id: "b1", group: "内部テーブル", want: "行を足したい", syntax: "APPEND ls_x TO lt_x.", note: "足す" },
  { id: "b2", group: "内部テーブル", want: "並べ替えたい", syntax: "SORT lt_x BY f1.", note: "並べ替える" },
  { id: "b3", group: "内部テーブル", want: "空にしたい", syntax: "CLEAR lt_x.", note: "空にする" },
];

function tcode() {
  const h = load("tcode-browser.js", "TcodeBrowser", {
    TCODE_REF: TCODES,
    TCODE_MODULE_ORDER: ["SD", "MM", "FI"],
  });
  h.api.init();
  return h;
}

const SHORTCUTS = [
  { id: "s1", keys: "Ctrl+C", module: "基本操作", action: "コピー", note: "選択をコピー" },
  { id: "s2", keys: "Ctrl+V", module: "基本操作", action: "貼り付け", note: "貼り付ける" },
  { id: "s3", keys: "Win+L", module: "ウィンドウ", action: "ロック", note: "画面をロック" },
];

function syntax() {
  const h = load("syntax-browser.js", "SyntaxBrowser", {
    ABAP_SYNTAX_REF: SYNTAX,
    ABAP_SYNTAX_GROUP_ORDER: ["基本", "内部テーブル"],
  });
  h.api.init();
  return h;
}

describe("約束1: 絞りが掛かっているとき、母数は絞りの中の件数", () => {
  test("Tコード: MM で 受注 を引くと 0件ヒット（MM の4件中）", () => {
    const h = tcode();
    h.nodes["tcode-search"] = h.nodes["tcode-search"] || el();
    h.api.show();
    // 絞りを MM にする (チップの押下と同じ経路の代わりに search を通す)
    expect(h.api.search("受注", "MM").length).toBe(0);
    expect(h.api.search("受注", "SD").length).toBe(3);
    expect(h.api.search("発注", "MM").length).toBe(2);
  });

  test("Tコード: 件数の行に絞りの名前と絞りの中の件数が出る", () => {
    const h = tcode();
    const node = h.nodes["tcode-result-count"] || el();
    h.nodes["tcode-result-count"] = node;
    h.api.show();
    // show() は ALL なので、まず ALL の字面を確かめる
    expect(node.textContent).toBe("全10件");
  });

  test("ABAP構文: 内部テーブル の絞りで 定数 を引くと0件", () => {
    const h = syntax();
    expect(h.api.search("定数", "内部テーブル").length).toBe(0);
    expect(h.api.search("定数", "基本").length).toBe(1);
    expect(h.api.search("定数", "ALL").length).toBe(1);
  });
});
// 件数の行は描画のときにだけ書かれる。入力欄に値を入れ、チップを押し、
// 描き直したあとの字面を読む。直す前は絞りを押しても母数が全件のままだった。
function renderWith(h, kind, query, chipKey) {
  const ids =
    kind === "tcode"
      ? { input: "tcode-search", count: "tcode-result-count", chips: "tcode-module-chips" }
      : { input: "syntax-search", count: "syntax-result-count", chips: "syntax-group-chips" };
  h.nodes[ids.input].value = query;
  h.api.show();
  if (chipKey && chipKey !== "ALL") clickChip(h.nodes[ids.chips], chipKey);
  return h.nodes[ids.count].textContent;
}

describe("約束2と3: 絞りが無いときの字面は変わらない", () => {
  test("Tコード: 検索語が空なら 全10件", () => {
    const h = tcode();
    expect(renderWith(h, "tcode", "", "ALL")).toBe("全10件");
  });

  test("Tコード: ALL で 受注 なら 3件ヒット（全10件中）", () => {
    const h = tcode();
    expect(renderWith(h, "tcode", "受注", "ALL")).toBe("3件ヒット（全10件中）");
  });

  test("ABAP構文: 検索語が空なら 全5件", () => {
    const h = syntax();
    expect(renderWith(h, "syntax", "", "ALL")).toBe("全5件");
  });

  test("ABAP構文: ALL で 定数 なら 1件ヒット（全5件中）", () => {
    const h = syntax();
    expect(renderWith(h, "syntax", "定数", "ALL")).toBe("1件ヒット（全5件中）");
  });
});
describe("約束4: 絞りの中だけを数えている", () => {
  test.each([
    ["SD", "受注", 3, 4],
    ["MM", "受注", 0, 4],
    ["MM", "発注", 2, 4],
    ["FI", "仕訳", 2, 2],
    ["ALL", "受注", 3, 10],
  ])("Tコード %s / %s", (mod, q, wantHits, wantScope) => {
    const h = tcode();
    expect(h.api.search(q, mod).length).toBe(wantHits);
    expect(h.api.search("", mod).length).toBe(wantScope);
  });

  test("絞りの母数の合計が全件に等しい (取りこぼしが無い)", () => {
    const h = tcode();
    const sum = ["SD", "MM", "FI"].reduce((n, m) => n + h.api.search("", m).length, 0);
    expect(sum).toBe(h.api.getCatalog().length);
  });
});
// ここが本題である。上の約束は search を直に呼ぶので、件数の行を直したことを
// 測っていない。チップを押した後の字面そのものを見る。
describe("約束5: 絞りを押した後の件数の行", () => {
  test.each([
    ["MM", "受注", "0件ヒット（MM の4件中）"],
    ["MM", "発注", "2件ヒット（MM の4件中）"],
    ["SD", "受注", "3件ヒット（SD の4件中）"],
    ["FI", "仕訳", "2件ヒット（FI の2件中）"],
  ])("Tコード %s / %s", (mod, q, want) => {
    const h = tcode();
    expect(renderWith(h, "tcode", q, mod)).toBe(want);
  });

  test.each([
    ["内部テーブル", "定数", "0件ヒット（内部テーブル の3件中）"],
    ["基本", "定数", "1件ヒット（基本 の2件中）"],
  ])("ABAP構文 %s / %s", (grp, q, want) => {
    const h = syntax();
    expect(renderWith(h, "syntax", q, grp)).toBe(want);
  });

  test("絞りを押して検索語が空なら、絞りの件数が出る", () => {
    const h = tcode();
    expect(renderWith(h, "tcode", "", "MM")).toBe("全4件");
  });

  test("絞りを押してから ALL に戻すと、全件の字面に戻る", () => {
    const h = tcode();
    expect(renderWith(h, "tcode", "受注", "MM")).toBe("0件ヒット（MM の4件中）");
    clickChip(h.nodes["tcode-module-chips"], "ALL");
    expect(h.nodes["tcode-result-count"].textContent).toBe("3件ヒット（全10件中）");
  });
});
// ショートカット確認も同じ型だった (3枚目)。1枚だけ直して終わらないための分。
describe("約束6: ショートカット確認も同じ字面になる", () => {
  function shortcut() {
    const h = load("shortcut-browser.js", "ShortcutBrowser", {
      QUIZ_DATA: SHORTCUTS.map((r) =>
        Object.assign({ category: "shortcut" }, r)
      ),
      SHORTCUT_MODULE_ORDER: ["基本操作", "ウィンドウ"],
    });
    h.api.init();
    return h;
  }

  test("絞りの中だけを数える", () => {
    const h = shortcut();
    expect(h.api.getCatalog().length).toBe(3);
    expect(h.api.search("", "基本操作").length).toBe(2);
    expect(h.api.search("", "ウィンドウ").length).toBe(1);
  });

  test("件数の行に絞りの名前と絞りの中の件数が出る", () => {
    const h = shortcut();
    h.nodes["shortcut-search"].value = "ロック";
    h.api.show();
    clickChip(h.nodes["shortcut-module-chips"], "基本操作");
    expect(h.nodes["shortcut-result-count"].textContent).toBe(
      "0件ヒット（基本操作 の2件中）"
    );
  });

  test("絞りが無いときの字面は変わらない", () => {
    const h = shortcut();
    h.nodes["shortcut-search"].value = "";
    h.api.show();
    expect(h.nodes["shortcut-result-count"].textContent).toBe("全3件");
  });
});
