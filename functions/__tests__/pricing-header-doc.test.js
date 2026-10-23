/**
 * 料金の正本 (config/pricing.js) の冒頭コメントに、金額の数字を書かせない。
 *
 * なぜ要るか:
 *   2026-10-24 まで、冒頭コメントは単品を「¥290〜¥980」、上限を「¥980」と
 *   直に書いていた。これは月額サブスクのときの額である。本番は買い切り
 *   (CHECKOUT_MODE = payment) で、そのとき PRICE_MAX は 1980 になるので、
 *   正本の冒頭だけが本番と違う額を言っていた。
 *
 *   引き継ぎメモは「いまどちらで動いているかは config/pricing.js の
 *   CHECKOUT_MODE と金額を見て確かめること」と次の自分に指示している。
 *   その確かめ先の冒頭が嘘だと、確かめた結果が嘘になる。
 *
 *   price-table-doc.test.js は docs の表を見張っているが、この冒頭コメントは
 *   どのテストも見ていなかった。規則は「数字ではなく定数名で書く」。
 *   定数名で書いてあるかぎり、宣言を変えてもコメントは腐らない。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "config", "pricing.js"), "utf8");

/** 冒頭の1つ目のブロックコメントだけを取り出す */
function headerComment(src) {
  const open = src.indexOf("/**");
  if (open !== 0) return null;
  const close = src.indexOf("*/");
  if (close < 0) return null;
  return src.slice(0, close + 2);
}

describe("料金の正本の冒頭コメント", () => {
  test("冒頭がブロックコメントで始まる", () => {
    expect(headerComment(SRC)).not.toBe(null);
  });

  test("円記号つきの金額を書いていない (¥0 だけは可)", () => {
    const head = headerComment(SRC);
    // ¥ のあとに1桁以上の数字。¥0 は「無料」の意味で額ではないので許す
    const hits = head.match(/¥[0-9][0-9,]*/g) || [];
    const bad = hits.filter((h) => h !== "¥0");
    expect(bad).toEqual([]);
  });

  test("円 で終わる金額を書いていない", () => {
    const head = headerComment(SRC);
    // 「10円単位」のような単位の説明は額ではないので許す
    const hits = head.match(/[0-9][0-9,]*円/g) || [];
    const bad = hits.filter((h) => h !== "10円");
    expect(bad).toEqual([]);
  });

  test("価格の段を定数名で説明している", () => {
    const head = headerComment(SRC);
    for (const name of [
      "FREE_SUBJECT_MAX_COUNT",
      "PRICE_CAP_COUNT",
      "PRICE_MIN",
      "PRICE_MAX",
      "CHECKOUT_MODE",
    ]) {
      expect(head.includes(name)).toBe(true);
    }
  });
});
