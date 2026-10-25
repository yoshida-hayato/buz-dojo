//
// 静的な頁 (guides と legal と index) が、検索と共有に出す札を持っていることのガード。
//
// なぜ要るか: 12:48便 (10/25) に測ったら、着地4頁のうち3頁に og:description が
// 無く、twitter:card も無かった。legal の3頁は description も canonical も
// 無いまま index,follow で sitemap に載っていた。どれもテストは1件も落ちない。
// 札が無い頁は、クローラに渡す説明文を持たない。頁の中身の問題ではなく、
// 頁の名札の問題なので、字面で見張るしかない。
//
// 測るほうが間違っていた話: 同じ便の自分が、name=description の直後に
// content が来る形だけを見る正規表現で数え、index.html の canonical を
// 「無い」と判定した。実際は起動時の script が作っていた。並び順を
// 前提にしない読み方にして、その自己検査もここに置く。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// タグ名の開きから次の閉じ山かっこまでを、属性の並びのまま取り出す
function tagsOf(text, name) {
  const out = [];
  const open = "<" + name;
  let i = text.indexOf(open);
  while (i >= 0) {
    const end = text.indexOf(">", i);
    if (end < 0) { break; }
    out.push(text.slice(i + open.length, end));
    i = text.indexOf(open, end);
  }
  return out;
}

// 引用符つきの属性を、並び順に依らず読む (量指定子つきの正規表現は使わない)
function attrsOf(src) {
  const out = {};
  let i = 0;
  while (i < src.length) {
    const eq = src.indexOf("=", i);
    if (eq < 0) { break; }
    let key = src.slice(i, eq).trim();
    const sp = key.lastIndexOf(" ");
    if (sp >= 0) { key = key.slice(sp + 1); }
    const q = src.charAt(eq + 1);
    if (q !== '"' && q !== "'") { i = eq + 1; continue; }
    const end = src.indexOf(q, eq + 2);
    if (end < 0) { break; }
    out[key.toLowerCase()] = src.slice(eq + 2, end);
    i = end + 1;
  }
  return out;
}

function metaMap(text) {
  const out = {};
  tagsOf(text, "meta").forEach((src) => {
    const a = attrsOf(src);
    const key = a.name || a.property;
    if (key) { out[key] = a.content || ""; }
  });
  return out;
}

function canonicalOf(text) {
  let href = "";
  tagsOf(text, "link").forEach((src) => {
    const a = attrsOf(src);
    if (a.rel === "canonical" && !href) { href = a.href || ""; }
  });
  return href;
}

function filesIn(folder) {
  return fs
    .readdirSync(path.join(ROOT, folder))
    .filter((n) => n.endsWith(".html"))
    .sort();
}

const GUIDES = filesIn("guides");
const LEGAL = filesIn("legal");

describe("札の読み取り — 属性の並び順に依らない (自己検査)", () => {
  test("content が先に来ても読める", () => {
    expect(metaMap("<meta content='x' name='description'>").description).toBe("x");
    expect(metaMap("<meta name='description' content='x'>").description).toBe("x");
  });

  test("property でも name でも同じ棚に入る", () => {
    expect(metaMap("<meta property='og:title' content='y'>")["og:title"]).toBe("y");
  });

  test("走査対象が見つかっている", () => {
    expect(GUIDES.length >= 4).toBe(true);
    expect(LEGAL.length >= 3).toBe(true);
  });
});

describe("guides — 共有の札がそろっている", () => {
  const WANT = ["description", "og:title", "og:description", "og:site_name", "twitter:card"];

  test("4頁すべてが5つの札を持ち、中身が空でない", () => {
    GUIDES.forEach((name) => {
      const meta = metaMap(read("guides/" + name));
      WANT.forEach((key) => {
        const value = (meta[key] || "").trim();
        expect([name, key, value.length > 0]).toEqual([name, key, true]);
      });
    });
  });

  test("自分自身を正典に名乗る", () => {
    GUIDES.forEach((name) => {
      expect([name, canonicalOf(read("guides/" + name))]).toEqual([name, "/guides/" + name]);
    });
  });
});

describe("legal — 検索に出す説明文と正典がある", () => {
  test("3頁すべてが説明文を持ち、中身が空でない", () => {
    LEGAL.forEach((name) => {
      const value = (metaMap(read("legal/" + name)).description || "").trim();
      expect([name, value.length > 0]).toEqual([name, true]);
    });
  });

  test("自分自身を正典に名乗る", () => {
    LEGAL.forEach((name) => {
      expect([name, canonicalOf(read("legal/" + name))]).toEqual([name, "/legal/" + name]);
    });
  });
});

describe("index.html — 正典は起動時に作る (静的に書かない)", () => {
  const INDEX = read("index.html");

  test("静的な canonical は置かない", () => {
    // 全パスが index.html に書き換えられるので、静的に / を名乗ると
    // sitemap の科目10本が「/ の複製」になる。だから此処は空が正しい。
    expect(canonicalOf(INDEX)).toBe("");
  });

  test("起動時の script が canonical-link を作っている", () => {
    expect(INDEX.indexOf("canonical-link") >= 0).toBe(true);
  });

  test("共有の札は静的に持つ", () => {
    const meta = metaMap(INDEX);
    ["description", "og:title", "og:description", "og:image", "twitter:card"].forEach((key) => {
      expect([key, (meta[key] || "").trim().length > 0]).toEqual([key, true]);
    });
  });
});
