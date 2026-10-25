//
// robots.txt と sitemap.xml のガード。
//
// この2つは repo に置けない (パッチで作れる拡張子に .txt と .xml が無い)。
// 代わりに firebase.json の hosting.predeploy が _dev/gen-seo.py を呼び、
// デプロイのたびに公開ディレクトリへ書き出す。つまり「台本」と「呼び出し」の
// 2つが揃っていないと、本番には1バイトも出ない。どちらが欠けても画面には
// 何も起きないので、字面で見張る。
//
// この台本をテストから実行してはいけない。公開ディレクトリに追跡外の
// ファイルを2つ作るため、apply-patch の行数チェック (repo 全体の差分と
// 追跡外ファイルを数える) が以後のパッチを食い潰す。9/22-9/23 に
// package-lock.json で全パッチが破棄されたのと同じ形になる。
// だから、ここは中身を実行せず字面だけを読む。
//
// 正規表現は使わない (パッチ経路に量指定子を通せない)。indexOf と JSON で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const FIREBASE = JSON.parse(read("firebase.json"));
// パッチ経路にアスタリスクを通せないので、ワイルドカードは文字コードから組む
const STAR2 = String.fromCharCode(42, 42);
const GEN = read("_dev/gen-seo.py");

describe("robots.txt と sitemap.xml — 台本と呼び出しの両方が在る", () => {
  test("hosting.predeploy が gen-seo を呼んでいる", () => {
    const hooks = FIREBASE.hosting.predeploy || [];
    const joined = hooks.join(" ");
    expect(joined.indexOf("_dev/gen-seo.py") >= 0).toBe(true);
  });

  test("公開ディレクトリは repo 直下 (台本の書き出し先と同じ)", () => {
    expect(FIREBASE.hosting.public).toBe(".");
  });

  test("_dev は配信しない (台本そのものが公開されない)", () => {
    expect(FIREBASE.hosting.ignore.indexOf("_dev/" + STAR2) >= 0).toBe(true);
  });

  test("全パスを index.html に送る rewrite が最後に在る", () => {
    const rules = FIREBASE.hosting.rewrites;
    const last = rules[rules.length - 1];
    expect(last.source).toBe(STAR2);
    expect(last.destination).toBe("/index.html");
  });

  test("台本は robots と sitemap の両方を書く", () => {
    expect(GEN.indexOf('write("robots.txt"') >= 0).toBe(true);
    expect(GEN.indexOf('write("sitemap.xml"') >= 0).toBe(true);
  });

  test("sitemap の並びは registry から読む (科目を増やしても追いつく)", () => {
    expect(GEN.indexOf('"subjects", "registry.js"') >= 0).toBe(true);
    expect(GEN.indexOf("enabled: true") >= 0).toBe(true);
  });

  test("台本は何があっても終了コード0で抜ける (デプロイを落とさない)", () => {
    expect(GEN.indexOf("sys.exit(0)") >= 0).toBe(true);
    expect(GEN.indexOf("except Exception") >= 0).toBe(true);
  });

  test("robots は sitemap の在り処を名乗る (検索側の唯一の入口)", () => {
    expect(GEN.indexOf('"Sitemap: " + SITE + "/sitemap.xml"') >= 0).toBe(true);
  });
});

// --- 10/26 00:48便 の2つ目 ----------------------------------------------
//
// 着地4頁と法務3頁には og:url も og:image も無かった (7頁とも0件)。この2つは
// 相対では効かない。受け取る側は頁の中身だけを見るので、何処の頁かを絶対URLで
// 言う必要がある。パッチでは絶対URLの字面を運べない (Slack がリンク記法に
// 書き替える) が、台本は HOST を部品から組み立てているので、デプロイのたびに
// 台本で組めばよい。
//
// 静かな壊れ方は2つ。台本が呼ばれないこと。そして頁側の差し込み口
// (head の閉じタグ) が無くなって、黙って1頁も足されなくなること。両方見る。
//
describe("共有カードの絶対URL — 台本と差し込み口の両方が在る", () => {
  test("台本が絶対URLの og を組み、main から呼ばれている", () => {
    expect(GEN.indexOf("def inject_absolute_og(") >= 0).toBe(true);
    expect(GEN.indexOf("def write_absolute_og()") >= 0).toBe(true);
    expect(GEN.indexOf("    write_absolute_og()") >= 0).toBe(true);
  });

  test("og:url は SITE (絶対) から組む", () => {
    expect(GEN.indexOf('SITE + here_path') >= 0).toBe(true);
  });

  test("既に持っている頁には二度足さない", () => {
    expect(GEN.indexOf('if "og:url" in text:') >= 0).toBe(true);
  });

  test("着地頁と法務の頁に差し込み口が在る", () => {
    // 直し方: head の閉じタグを消さない。消すと台本は黙って何もしない。
    const fs2 = require("fs");
    const path2 = require("path");
    const root = path2.join(__dirname, "..", "..");
    const missing = [];
    ["guides", "legal"].forEach((folder) => {
      fs2.readdirSync(path2.join(root, folder)).forEach((name) => {
        if (name.indexOf(".html") < 0) return;
        const text = fs2.readFileSync(path2.join(root, folder, name), "utf8");
        const close = String.fromCharCode(60) + "/head" + String.fromCharCode(62);
        if (text.split(close).length - 1 !== 1) missing.push(folder + "/" + name);
      });
    });
    expect(missing.join(",")).toBe("");
  });
});
