//
// 法務ページの差し替えが「空振り」していないことのガード
//
// legal/terms.html と legal/commerce.html は、CHECKOUT_MODE が payment の
// ときだけ JavaScript で本文を買い切りの文面に差し替える。差し替えは
// 静的HTMLの文字列を手がかり(needle)に探して当てる方式なので、
// HTMLの日本語を少し直すだけで手がかりが外れ、差し替えが黙って空振りする。
// 空振りすると「規約は月額の自動更新と書いてあるのに、Stripe は一回払いで
// 課金する」という表示と課金の食い違いが本番に出る。
//
// billing-mode-guard.test.js は差し替えコードが「在ること」しか見ていない。
// このファイルは差し替えが「当たること」を見る。CHECKOUT_MODE の値に
// 関係なく常に走らせる。切替の日ではなく、ズレを入れた日に落とすため。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 分割点は src の書き方 (相対でも絶対でも) に依存させない。
const SPLIT_AT = 'config/pricing.js"></script>';

// 静的な本文と、差し替えスクリプトを分ける。
// 手がかりはスクリプト本体にも文字列として現れるので、分けないと
// 「スクリプトの中に在った」だけで通ってしまう。
function splitDoc(rel) {
  const src = read(rel);
  const at = src.indexOf(SPLIT_AT);
  if (at < 0) throw new Error(rel + " に pricing.js の読み込みが無い");
  return { markup: src.slice(0, at), script: src.slice(at) };
}

// swap("セレクタ", "手がかり", "差し替えHTML") の第1・第2引数を取り出す。
// 正規表現は使わない (パッチ経路に量指定子を通せないため)。
function swapCalls(script) {
  const out = [];
  const parts = script.split("swap(");
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const q = [];
    let from = 0;
    while (q.length < 4) {
      const at = seg.indexOf('"', from);
      if (at < 0) break;
      q.push(at);
      from = at + 1;
    }
    if (q.length < 4) continue;
    out.push({
      sel: seg.slice(q[0] + 1, q[1]),
      needle: seg.slice(q[2] + 1, q[3]),
    });
  }
  return out;
}

// commerce.html は th の文字列をキーに td を差し替える。
// var TEXT = { "販売価格": "...", ... } のキー行だけを拾う。
function textKeys(script) {
  const start = script.indexOf("var TEXT = {");
  const end = script.indexOf("var rows =");
  if (start < 0 || end < 0) throw new Error("commerce.html の TEXT 表が見つからない");
  const keys = [];
  script.slice(start, end).split("\n").forEach((line) => {
    const t = line.trim();
    if (t.indexOf('"') !== 0) return;
    const close = t.indexOf('"', 1);
    if (close < 0) return;
    if (t.indexOf(":", close) !== close + 1) return;
    keys.push(t.slice(1, close));
  });
  return keys;
}

describe("legal/terms.html の差し替えが当たる", () => {
  const doc = splitDoc("legal/terms.html");
  const calls = swapCalls(doc.script);

  test("差し替えが4件ある (黙って減っていない)", () => {
    expect(calls.length).toBe(4);
  });

  calls.forEach((c) => {
    test("手がかりが " + c.sel + " の中にある: " + c.needle, () => {
      const at = doc.markup.indexOf(c.needle);
      expect(at).toBeGreaterThanOrEqual(0);
      // querySelectorAll(sel) が拾える位置にあること。
      // 入れ子 (p の中の strong など) でも通るように、
      // 直前の開きタグと直後の閉じタグで挟まれていることを見る。
      const open = doc.markup.lastIndexOf("<" + c.sel, at);
      expect(open).toBeGreaterThanOrEqual(0);
      const close = doc.markup.indexOf("</" + c.sel + ">", open);
      expect(close).toBeGreaterThan(at);
    });
  });
});

describe("legal/commerce.html の差し替えが当たる", () => {
  const doc = splitDoc("legal/commerce.html");
  const keys = textKeys(doc.script);

  test("差し替えるキーが3件ある", () => {
    expect(keys.length).toBe(3);
  });

  keys.forEach((key) => {
    test("th がある: " + key, () => {
      expect(doc.markup.indexOf("<th>" + key + "</th>")).toBeGreaterThanOrEqual(0);
    });
  });
});
