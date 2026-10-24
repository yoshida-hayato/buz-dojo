//
// 計測の取り付け漏れを見張る。
//
// なぜ要るか: GA4 の札は index.html にしか入っていなかった。SPA の中は
// 計れるが、SPA の外に在る静的な頁 (guides と legal) は別々に取り付ける
// 必要がある。guides は 10/17 に付いたが、legal の3頁は 10/25 00:48便 まで
// 無計測だった。sitemap には載り、index,follow も立っているので、
// 検索から legal に降りた人は1人も数に入っていなかった。
// とくに legal/commerce.html (特定商取引法の表記) は、払う前に読む頁である。
// ここの閲覧は購入の意思にいちばん近い合図なのに、見えていなかった。
//
// 見張る対象は「sitemap に載る頁」と同じ集合にする。つまり index.html と
// guides と legal の全 html。1枚足したときに自動で対象に入る形にして、
// 人が思い出さなくても漏れが落ちるようにする。
//
// 取り付け方は2通りあり、どちらも意図された形である。混ぜて見張らないこと。
//   index.html — Firebase Analytics の SDK。在処は、すでに頁に在る
//     firebase-app-compat のタグから作る (版が自動でそろう)。gtag は使わない。
//   guides と legal — gtag.js。Firebase の SDK を積んでいない静的な頁なので、
//     こちらは札の配り元を自分で読み込む。
// 10/25 00:48便 に、この2通りを1つの形で見張ろうとして3件落とした。
// 片方の作法をもう片方に当てはめないこと。
//
// admin は逆に、付いていないことを見張る。社長自身の操作が数に混ざると、
// 売上0件・流入ほぼ0のいまの段では、数字がまるごと社長の足跡になる。
//
// 正規表現は使わない。indexOf で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const htmlIn = (folder) =>
  fs
    .readdirSync(path.join(ROOT, folder))
    .filter((n) => n.endsWith(".html"))
    .sort()
    .map((n) => folder + "/" + n);

// gtag で取り付ける静的な頁 (SPA の外)
const STATIC = htmlIn("guides").concat(htmlIn("legal"));
// sitemap に載る頁の全体
const MEASURED = ["index.html"].concat(STATIC);
const ADMIN = htmlIn("admin");

describe("計測 — sitemap に載る頁は1枚も無計測でない", () => {
  test("対象の集め方が効いている (自己検査)", () => {
    expect(MEASURED.length >= 8).toBe(true);
    expect(MEASURED.indexOf("legal/commerce.html") >= 0).toBe(true);
    expect(MEASURED.indexOf("index.html") >= 0).toBe(true);
    expect(STATIC.indexOf("index.html") >= 0).toBe(false);
  });

  test("どの頁も測定IDを設定から読む (字面で焼き込まない)", () => {
    MEASURED.forEach((rel) => {
      const text = read(rel);
      expect([rel, text.indexOf("FIREBASE_CONFIG") >= 0]).toEqual([rel, true]);
      expect([rel, text.indexOf("measurementId") >= 0]).toEqual([rel, true]);
    });
  });

  test("測定IDが無い環境では黙って何もしない (頁が落ちない)", () => {
    MEASURED.forEach((rel) => {
      const text = read(rel);
      const bails =
        text.indexOf("if (!id) { return; }") >= 0 ||
        text.indexOf("if (!FIREBASE_CONFIG.measurementId) return;") >= 0;
      expect([rel, bails]).toEqual([rel, true]);
    });
  });

  test("どの頁も計測の失敗でアプリ本体を止めない", () => {
    MEASURED.forEach((rel) => {
      const text = read(rel);
      expect([rel, text.indexOf("catch") >= 0]).toEqual([rel, true]);
    });
  });
});

describe("計測 — 静的な頁 (guides と legal) は gtag で積む", () => {
  test("gtag を立てて、札を読み込む", () => {
    STATIC.forEach((rel) => {
      const text = read(rel);
      expect([rel, text.indexOf("window.dataLayer") >= 0]).toEqual([rel, true]);
      expect([rel, text.indexOf("window.gtag") >= 0]).toEqual([rel, true]);
      expect([rel, text.indexOf("/gtag/js?id=") >= 0]).toEqual([rel, true]);
      expect([rel, text.indexOf("config/firebase-config.js") >= 0]).toEqual([rel, true]);
    });
  });

  test("札の配り元を素のドメインで書かない (パッチ経路でこの行が壊れる)", () => {
    // Slack は語とドットと実在する TLD の並びをリンク記法に書き替える。
    // 素で書くと、以後この行をパッチで直せなくなる。組み立てに揃える。
    STATIC.forEach((rel) => {
      const text = read(rel);
      expect([rel, text.indexOf("'googletagmanager'") >= 0]).toEqual([rel, true]);
    });
  });
});

describe("計測 — index.html は Firebase の SDK で積む (gtag ではない)", () => {
  const INDEX = read("index.html");

  test("SDK の在処は既存のタグから作る (URL の字面を置かない)", () => {
    expect(INDEX.indexOf("firebase-app-compat") >= 0).toBe(true);
    expect(INDEX.indexOf("firebase-analytics-compat") >= 0).toBe(true);
  });
});

describe("計測 — admin には付けない (社長の足跡を数に混ぜない)", () => {
  test("admin の頁は GA4 を積んでいない", () => {
    expect(ADMIN.length >= 1).toBe(true);
    ADMIN.forEach((rel) => {
      const text = read(rel);
      expect([rel, text.indexOf("measurementId") >= 0]).toEqual([rel, false]);
      expect([rel, text.indexOf("/gtag/js?id=") >= 0]).toEqual([rel, false]);
    });
  });
});
