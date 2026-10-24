//
// 検索の着地頁 (guides/) のガード。
//
// なぜ要るか: guides の頁は SPA の外に在る静的な HTML で、検索から直に
// 降りてくる唯一の面である。ここが壊れても SPA のテストは1件も落ちない。
// 10/25 00:48便 に4枚目 (プランニング2級) を足したとき、取りこぼしが
// 3箇所あった: トップページのフッターの一覧、他のガイドからの相互リンク、
// そして分野名が subjects/ の定義とずれていないか。
// 1枚足すたびに同じ3箇所を人が思い出す形にしない。
//
// h1 から h6 を使っているかは見張らない。いまは div に role=heading で
// 書いてあるが、それはパッチ経路で h タグを運べないという私の制約であって、
// 頁のあるべき姿ではない。社長が手で本物の見出しに直したときに
// このテストが落ちてはいけない。見張るのは「見出しが1本在ること」までにする。
//
// 正規表現は使わない。indexOf で読む (既存の seo ガードと同じ作法)。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const GUIDE_DIR = path.join(ROOT, "guides");
const GUIDE_FILES = fs
  .readdirSync(GUIDE_DIR)
  .filter((n) => n.endsWith(".html"))
  .sort();

const PLANNING = "seisan-kanri-planning-2kyu.html";

describe("guides — 着地頁がそろっていること", () => {
  test("ガイドは4枚以上あり、プランニング2級が含まれる", () => {
    expect(GUIDE_FILES.length >= 4).toBe(true);
    expect(GUIDE_FILES.indexOf(PLANNING) >= 0).toBe(true);
  });

  test("どの頁も自分自身を正典 (canonical) に名乗る", () => {
    GUIDE_FILES.forEach((name) => {
      const text = read("guides/" + name);
      const want = "/guides/" + name;
      const hit =
        text.indexOf("rel='canonical' href='" + want + "'") >= 0 ||
        text.indexOf('rel="canonical" href="' + want + '"') >= 0;
      expect([name, hit]).toEqual([name, true]);
    });
  });

  test("どの頁も見出しを1本持ち、題と説明が空でない", () => {
    GUIDE_FILES.forEach((name) => {
      const text = read("guides/" + name);
      expect([name, text.indexOf("aria-level='1'") >= 0 || text.indexOf('aria-level="1"') >= 0 || text.indexOf("<h1") >= 0]).toEqual([name, true]);
      expect([name, text.indexOf("name='description'") >= 0 || text.indexOf('name="description"') >= 0]).toEqual([name, true]);
      expect([name, text.indexOf("index,follow") >= 0]).toEqual([name, true]);
    });
  });
});

describe("guides — トップページのフッターが全枚を挙げている", () => {
  // ここが抜けると、新しい頁への内部リンクがサイト内に1本も無くなる。
  test("index.html のフッターに、guides の全ファイルへのリンクが在る", () => {
    const index = read("index.html");
    GUIDE_FILES.forEach((name) => {
      const href = 'href="/guides/' + name + '"';
      expect([name, index.indexOf(href) >= 0]).toEqual([name, true]);
    });
  });
});

describe("guides — 生産管理の3枚が互いを指している", () => {
  const TRIO = [
    "seisan-kanri-2kyu.html",
    "seisan-kanri-operation-2kyu.html",
    PLANNING,
  ];

  test("3枚それぞれが、他の2枚へのリンクを持つ", () => {
    TRIO.forEach((name) => {
      const text = read("guides/" + name);
      TRIO.forEach((other) => {
        if (other === name) { return; }
        const hit = text.indexOf("/guides/" + other) >= 0;
        expect([name, other, hit]).toEqual([name, other, true]);
      });
    });
  });
});

