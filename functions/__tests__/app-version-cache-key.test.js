//
// キャッシュ鍵 APP_VERSION のガード。
//
// なぜ要るか (2026-10-11 09:48便の実測):
// firebase.json は /js/ と /css/ と /data/ と /config/ と /subjects/ と /assets/ を
// max-age=31536000 immutable で配っている。再訪ユーザーのブラウザが
// 去年の中身を1年掴んで離さない形である。それを避ける唯一の鍵が
// index.html が付ける ?v=APP_VERSION で、値は config/version.js に在る。
//
// つまり config/version.js が動かない日は、その日に main へ入れた
// js と css の変更は、再訪ユーザーには1バイトも届かない。
// 10/11 は 13件のコミットが入ったのに鍵が 2026-10-10-v1 のままだった。
// 新規訪問者だけが新しい画面を見ている状態になっていた。
//
// index.html は version.js を bust 付きで同期取得してから script タグを組むので、
// 鍵が動けば次の表示で全員に届く。だから「鍵が no-cache で配られていること」と
// 「握る側が immutable であること」の対を、ここで要求する。
//
// 正規表現は使わない (パッチ経路に量指定子を通せない)。indexOf と JSON で読む。
// アスタリスクも書けないので、ワイルドカードは文字コードから組む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const STAR2 = String.fromCharCode(42, 42);
const FIREBASE = JSON.parse(read("firebase.json"));

function appVersionIn(rel) {
  const src = read(rel);
  const key = "APP_VERSION = ";
  const i = src.indexOf(key);
  if (i < 0) return "";
  const q1 = src.indexOf(String.fromCharCode(34), i);
  if (q1 < 0) return "";
  const q2 = src.indexOf(String.fromCharCode(34), q1 + 1);
  if (q2 < 0) return "";
  return src.slice(q1 + 1, q2);
}

function headerValue(source) {
  const rows = FIREBASE.hosting.headers || [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].source !== source) continue;
    const hs = rows[i].headers || [];
    for (let j = 0; j < hs.length; j += 1) {
      if (hs[j].key === "Cache-Control") return hs[j].value;
    }
  }
  return "";
}

describe("キャッシュ鍵 APP_VERSION", () => {
  test("config/version.js から1つだけ読み取れている", () => {
    expect(appVersionIn("config/version.js").length).toBeGreaterThan(3);
  });

  test("日付と版の形をしている (いつの鍵かが人に読めること)", () => {
    const v = appVersionIn("config/version.js");
    expect(v.indexOf("2026-") === 0 || v.indexOf("2027-") === 0).toBe(true);
    expect(v.indexOf("-v") > 0).toBe(true);
  });

  test("互換シム data/version.js も同じ値である", () => {
    // 本体は config/version.js。シムは読まれていないが、値が食い違うと
    // 次に読む人が どちらが効いているか を取り違える。
    expect(appVersionIn("data/version.js")).toBe(appVersionIn("config/version.js"));
  });

  test("鍵そのものは no-cache で配る (握られたら更新判定が死ぬ)", () => {
    expect(headerValue("/config/version.js").indexOf("no-store") >= 0).toBe(true);
    expect(headerValue("/data/version.js").indexOf("no-store") >= 0).toBe(true);
  });

  test("鍵で守る側は immutable で配る (鍵が要る理由そのもの)", () => {
    expect(headerValue("/js/" + STAR2).indexOf("immutable") >= 0).toBe(true);
    expect(headerValue("/css/" + STAR2).indexOf("immutable") >= 0).toBe(true);
  });

  test("index.html は鍵を bust 付きで取り直してから script を組む", () => {
    const INDEX = read("index.html");
    expect(INDEX.indexOf("config/version.js?_=") >= 0).toBe(true);
    expect(INDEX.indexOf("?v=") >= 0).toBe(true);
  });
});
