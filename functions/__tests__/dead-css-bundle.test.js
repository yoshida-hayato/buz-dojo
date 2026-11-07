//
// css/style.css が死んだ束であることの見張り。
//
// 実測 (2026-11-07): css/style.css は _dev/rebuild-css.py が分割後の css を
// 束ねた控えで、どの頁も link していない。それでいて配信には乗っていて、
// 本番から 86,892 バイトが取れた。中身は部品より750行古い
// (rebuild-css.py は predeploy にも pretest にも繋がっていないので、
// 誰かが手で走らせないかぎり新しくならない)。束ねる一覧からは
// legal.css と premium.css が漏れてもいる。
// つまり「正本のつもりで読むと間違える控え」が、読む人が0のまま
// 配信され続けていた。
//
// どうしたか: 束ね直すのではなく、配信から外して開発用の作りかけと決めた。
// 読む側が0なので新しくする価値が無い。消すのは行数が大きすぎて
// パッチ1件に収まらないので、repo には残る。
//
// だから見張るのは2つだけである。
//   (1) 配信される頁と台本が、この控えを1つも指していないこと
//   (2) firebase.json の ignore に入っていて、配信に乗らないこと
// どちらかが崩れると、利用者は2か月前の見た目の css を受け取りうる。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const BUNDLE = "css/style.css";

function listFiles(rel, tails) {
  const dir = path.join(ROOT, rel);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  return names
    .filter((n) => tails.some((t) => n.slice(-t.length) === t))
    .map((n) => (rel ? rel + "/" + n : n));
}

// 配信に乗る頁と台本。css と docs は見ない (css の註に束の名前が残っていて、
// それは配信の経路ではないため)。
const SERVED = []
  .concat(listFiles("", [".html"]))
  .concat(listFiles("admin", [".html"]))
  .concat(listFiles("guides", [".html"]))
  .concat(listFiles("legal", [".html"]))
  .concat(listFiles("js", [".js"]));

describe("死んだ css の束", () => {
  test("見る先が1枚も無いと、この見張りは何も主張できない", () => {
    expect(SERVED.length).toBeGreaterThan(10);
  });

  test("配信される頁と台本は、束を1つも指していない", () => {
    const bad = SERVED.filter((rel) => {
      const body = fs.readFileSync(path.join(ROOT, rel), "utf8");
      return body.indexOf(BUNDLE) >= 0 || body.indexOf("/" + BUNDLE) >= 0;
    });
    expect(bad.join(",")).toBe("");
  });

  test("束は配信から外れている", () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
    const ignore = (cfg.hosting && cfg.hosting.ignore) || [];
    expect(ignore.indexOf(BUNDLE) >= 0).toBe(true);
  });

  test("束ね直す台本は repo に在る (手で走らせる道具として残す)", () => {
    expect(fs.existsSync(path.join(ROOT, "_dev", "rebuild-css.py"))).toBe(true);
  });
});
