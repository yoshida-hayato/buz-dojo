//
// 管理画面のタブの帯が、画面の幅を越えて横に伸びないことのガード。
//
// なぜ要るか: タブは display flex の1行で、折り返しの指定が無かった。
// 18:48便 に「検索通知」を足して8枚になり、幅390で100px、幅360で130px、
// 幅320で170px、頁そのものが横にはみ出した (Chromium で実測)。
// 足す前の7枚でも 45 / 75 / 115px はみ出していたので、タブを1枚足すたびに
// 静かに悪くなる形だった。flex-wrap を入れると3つの幅すべてで0になり、
// 帯の高さは 164 から 187 に1段ぶん増えるだけである (実測)。
//
// 画面の崩れはテストでは見えないので、字面で見張る。タブを足す側
// (js/admin-indexnow.js など) は自分で nav に button を足すので、
// 誰も「帯が1行に収まるか」を確かめない。
//
// 同じ規則が css/admin.css と css/style.css の2枚に在る。admin の2頁が
// 読むのは admin.css だけだが、2枚がずれると次に読む人が取り違える。
// 両方を突き合わせる。
//
// 正規表現は使わない。indexOf と split で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const FILES = ["css/admin.css", "css/style.css"];
const SELECTOR = ".admin-tabs {";

// 規則の中身 (開きかっこから閉じかっこまで) を取り出す。無ければ null。
function ruleBody(css) {
  const at = css.indexOf(SELECTOR);
  if (at < 0) return null;
  const from = at + SELECTOR.length;
  const end = css.indexOf("}", from);
  if (end < 0) return null;
  return css.slice(from, end);
}

describe("管理画面のタブの帯", () => {
  test("どちらの css にも規則が在る", () => {
    FILES.forEach((f) => {
      expect(ruleBody(read(f)) === null).toBe(false);
    });
  });

  test("1行に押し込まず折り返す (頁が横にはみ出さないため)", () => {
    FILES.forEach((f) => {
      const body = ruleBody(read(f)) || "";
      expect(body.indexOf("flex-wrap: wrap") >= 0).toBe(true);
    });
  });

  test("横スクロールで隠す形にはしない (押す所が画面外に出る)", () => {
    FILES.forEach((f) => {
      const body = ruleBody(read(f)) || "";
      expect(body.indexOf("nowrap") < 0).toBe(true);
    });
  });

  test("2枚の規則が1文字も違わない (ずれたら次に読む人が取り違える)", () => {
    const first = ruleBody(read(FILES[0]));
    FILES.forEach((f) => {
      expect(ruleBody(read(f))).toBe(first);
    });
  });
});
