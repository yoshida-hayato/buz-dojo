//
// 着地頁の見出しが、本物の見出しタグであることのガード。
//
// なぜ要るか: guides の4頁は 10/18 から 10/25 まで、見出しを div に
// role=heading と aria-level で書いていた。本物の h タグにしなかったのは
// 社員のパッチ経路が h タグを運べなかったからで、頁のあるべき姿では
// なかった。10/25 06:48便 に運ぶ道が見つかって閉じた。
//
// 運ぶ道には癖がある。開きと閉じの両方で、山かっこの直前に空白を1つ
// 置いた形 (h1 空白 大かっこ ... 斜線 h1 空白 大かっこ) でないと、
// Slack が送信の時点で Markdown の井桁に変換する。変換されても
// old_string は無傷なので当たってしまい、頁に素の井桁が出る。
// この壊れ方は見た目にしか出ないので、ここで字面として捕まえる。
//
// 正規表現は使わない。indexOf と split で読む。
// このファイル自身がパッチ経路を通るので、山かっこと h を隣り合わせに
// 書かない (LT を足して組み立てる)。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const GUIDE_DIR = path.join(ROOT, "guides");
const GUIDE_FILES = fs
  .readdirSync(GUIDE_DIR)
  .filter((n) => n.endsWith(".html"))
  .sort();

const LT = "<";
const open = (lvl) => LT + "h" + lvl;
const close = (lvl) => LT + "/h" + lvl;
const count = (text, needle) => text.split(needle).length - 1;
const read = (name) => fs.readFileSync(path.join(GUIDE_DIR, name), "utf8");

describe("着地頁の見出し — 本物の見出しタグであること", () => {
  test("どの頁も h1 をちょうど1本持つ", () => {
    GUIDE_FILES.forEach((name) => {
      expect([name, count(read(name), open(1))]).toEqual([name, 1]);
    });
  });

  test("どの頁も h2 を1本以上持つ", () => {
    GUIDE_FILES.forEach((name) => {
      expect([name, count(read(name), open(2)) >= 1]).toEqual([name, true]);
    });
  });

  test("開きの本数と閉じの本数が一致する", () => {
    GUIDE_FILES.forEach((name) => {
      const text = read(name);
      [1, 2].forEach((lvl) => {
        expect([name, lvl, count(text, open(lvl))]).toEqual([
          name,
          lvl,
          count(text, close(lvl)),
        ]);
      });
    });
  });

  test("div の role=heading は1つも残っていない", () => {
    GUIDE_FILES.forEach((name) => {
      const text = read(name);
      const hit =
        text.indexOf("role='heading'") >= 0 || text.indexOf('role="heading"') >= 0;
      expect([name, hit]).toEqual([name, false]);
    });
  });

  test("Markdown の井桁が素で混入していない", () => {
    // パッチ経路が見出しを変換したときに、この形でファイルに届く。
    GUIDE_FILES.forEach((name) => {
      read(name)
        .split("\n")
        .forEach((line, i) => {
          const head = line.trim().slice(0, 3);
          const bad = head.indexOf("#") === 0 || head.indexOf("##") === 0;
          expect([name, i + 1, bad]).toEqual([name, i + 1, false]);
        });
    });
  });

  test("閉じタグは、山かっこの直前に空白を1つ置いた形で書かれている", () => {
    // ここが素の形に戻ると、次に同じ行を置換したときに井桁へ化ける。
    GUIDE_FILES.forEach((name) => {
      const text = read(name);
      [1, 2].forEach((lvl) => {
        const total = count(text, close(lvl));
        const spaced = count(text, close(lvl) + " " + ">");
        expect([name, lvl, spaced]).toEqual([name, lvl, total]);
      });
    });
  });
});
