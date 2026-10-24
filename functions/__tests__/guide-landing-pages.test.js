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

describe("プランニング2級の頁 — 中身が科目の定義とずれていない", () => {
  const PAGE = read("guides/" + PLANNING);
  const SUBJECT = read("subjects/biz-pm-planning/subject.js");

  // subject.js の modules の鍵を素朴に切り出す (量指定子なし)
  const moduleNames = (() => {
    const start = SUBJECT.indexOf("modules: {");
    const end = SUBJECT.indexOf("inputCategories");
    const body = SUBJECT.slice(start, end);
    const out = [];
    body.split("\n").forEach((line) => {
      const colon = line.lastIndexOf(":");
      if (colon < 0) { return; }
      let key = line.slice(0, colon).trim();
      if (!key || key === "modules") { return; }
      if (key.charAt(0) === '"') { key = key.slice(1, key.length - 1); }
      out.push(key);
    });
    return out;
  })();

  test("subject.js から7分野を読めている (切り出しの自己検査)", () => {
    expect(moduleNames.length).toBe(7);
    expect(moduleNames.indexOf("製品企画") >= 0).toBe(true);
  });

  test("7分野すべてが本文の箇条書きの頭に在る", () => {
    // 字面がどこかに在るだけでは通さない。説明文 (meta description) にも
    // 同じ7語が並んでいるので、本文の分野名を書き替えても素通りしてしまう。
    // 実測: 最初に書いた緩い形は、設計工程管理 を別の字に変えても落ちなかった。
    moduleNames.forEach((name) => {
      const want = "<li>" + name + " \u2014 ";
      expect([name, PAGE.indexOf(want) >= 0]).toEqual([name, true]);
    });
  });

  test("金額は pricing.js に尋ねる (字面で書かない)", () => {
    expect(PAGE.indexOf("getSubjectPriceYen('biz-pm-planning')") >= 0).toBe(true);
    expect(PAGE.indexOf("getSubjectPriceYen('biz-career')") >= 0).toBe(true);
    expect(PAGE.indexOf("PACK_PRICE_YEN") >= 0).toBe(true);
    // 買い切りと月額のどちらで動いているかは pricing.js を見て決める
    expect(PAGE.indexOf("CHECKOUT_MODE") >= 0).toBe(true);
  });

  test("もう一方の区分は出題されないと書いてある (買わせすぎない)", () => {
    expect(PAGE.indexOf("オペレーション専門は、この試験では出題されません") >= 0).toBe(true);
  });

  test("過去問ではないと書いてある", () => {
    expect(PAGE.indexOf("過去問の本文は使っていません") >= 0).toBe(true);
  });
});

describe("gen-seo — 新しいガイドが sitemap に自動で入る", () => {
  const GEN = read("_dev/gen-seo.py");

  test("台本は guides のディレクトリを走査する (1枚ごとに台本を直さない)", () => {
    expect(GEN.indexOf('for folder in ("guides", "legal")') >= 0).toBe(true);
    expect(GEN.indexOf('name.endswith(".html")') >= 0).toBe(true);
  });
});
