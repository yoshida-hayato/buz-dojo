//
// ブリッジがパッチを運ぶ途中で起きる、2通りの静かな壊れ方のガード。
//
// どちらも 10/25 06:48便 に、本番に出ている js/admin-stripe-status.js で
// 実際に見つかった。テストは1件も落ちておらず、画面を描くまで分からなかった。
//
// 壊れ方1: 実体参照が素の字になる。
//   ブリッジは apply_patch で html.unescape を1回かけてから json.loads する。
//   だから new_string に amp や lt を実体参照の形で書くと、ファイルには
//   素の & や < が書かれる。エスケープ関数がこれを踏むと、& を & に、
//   < を < に置き換える「同じ字への置換」になり、黙って無効化される。
//   admin-stripe-status.js はこの形で、管理画面に HTML を注入できた
//   (Chromium で実測。img が1本生えて onerror が走った)。
//
// 壊れ方2: 見出しタグが Markdown の井桁になる。
//   Slack が送信の時点で HTML を Markdown に変換するため。HTML を組み立てる
//   文字列の中に素の井桁が入り、画面に井桁がそのまま出る。
//
// 見張るのは利用者に届く側だけにする。functions/__tests__ の中には、
// md の見出しを字面で探すテストが在り、それは正しい用途である。
//
// 正規表現は使わない。indexOf で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const HASH = String.fromCharCode(35);

function listFiles() {
  const out = [];
  const add = (dir, ext) => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) { return; }
    fs.readdirSync(full)
      .filter((n) => n.endsWith(ext))
      .sort()
      .forEach((n) => out.push(dir + "/" + n));
  };
  add("js", ".js");
  add("guides", ".html");
  add("legal", ".html");
  add("admin", ".html");
  out.push("index.html");
  return out;
}

const FILES = listFiles();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 同じ字への置換。実体参照がほどかれた痕跡そのもの。
const DEAD = [
  'replace(/&/g, "&")',
  "replace(/&/g, '&')",
  'replace(/</g, "<")',
  "replace(/</g, '<')",
  'replace(/>/g, ">")',
  "replace(/>/g, '>')",
];

describe("ブリッジの unescape で壊れた痕跡が無いこと", () => {
  test("見張る対象が集まっている", () => {
    expect(FILES.length >= 10).toBe(true);
  });

  test("エスケープが同じ字への置換になっていない", () => {
    FILES.forEach((rel) => {
      const text = read(rel);
      DEAD.forEach((bad) => {
        expect([rel, bad, text.indexOf(bad) >= 0]).toEqual([rel, bad, false]);
      });
    });
  });

  test("文字列の中に Markdown の井桁の見出しが無い", () => {
    // 探すのは、引用符の直後に井桁が1個から6個続き、そのあと空白が来る形。
    // CSS の選択子 (井桁のあと空白が来ない) は見逃す。
    FILES.forEach((rel) => {
      read(rel)
        .split("\n")
        .forEach((line, i) => {
          ['"' + HASH, "'" + HASH].forEach((start) => {
            let at = line.indexOf(start);
            while (at >= 0) {
              let k = at + 1;
              while (line[k] === HASH) { k += 1; }
              const levels = k - at - 1;
              const bad = levels >= 1 && levels <= 6 && line[k] === " ";
              expect([rel, i + 1, bad]).toEqual([rel, i + 1, false]);
              at = line.indexOf(start, at + 1);
            }
          });
        });
    });
  });
});

describe("管理画面の Stripe タブ — エスケープの出どころ", () => {
  const REPORTS = read("admin/reports.html");

  test("reports.html が dom-util をこのパネルより先に読む", () => {
    // esc が escapeHtml に委ねているので、順序が入れ替わるとパネルが落ちる。
    const a = REPORTS.indexOf("../js/dom-util.js");
    const b = REPORTS.indexOf("../js/admin-stripe-status.js");
    expect(a >= 0).toBe(true);
    expect(b >= 0).toBe(true);
    expect(a < b).toBe(true);
  });

  test("パネルは自前でエスケープを書き直していない", () => {
    const panel = read("js/admin-stripe-status.js");
    expect(panel.indexOf("escapeHtml(") >= 0).toBe(true);
  });
});
