//
// index.html のガード。このファイルより前、index.html を読むテストは1件も無かった。
//
// 10/10 にトップページへ2つのものを入れた。どちらも「在るはずなのに黙って
// 消えても誰も気づかない」形の変更で、消えたときの害が静かに出る。
//
//   1. アクセス解析 (GA4) の起動。privacy.html は「Google アナリティクスで
//      取得します」と利用者に宣言している。宣言だけ残って計測が消えると、
//      取ると言って取っていない状態になる。これは法務文面の嘘である
//   2. 科目10本のフッターリンク。/sap などの深いリンクは設計された入口だが、
//      科目ピッカーは button で組まれているのでアンカーが生成されない。
//      このフッターが唯一の、人も検索エンジンも辿れる道である。消えると
//      11面ある商品棚のうち5面しか外に見せていない状態に戻る
//
// どちらも「宣言と実装」「レジストリと入口」の2点を突き合わせて見張る。
// 片側だけを見ると、両方消えたときに静かに通ってしまう。
//
// 正規表現は使わない (パッチ経路に量指定子を通せない)。すべて indexOf で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const INDEX = read("index.html");
const PRIVACY = read("legal/privacy.html");
const REGISTRY = read("subjects/registry.js");

// --- レジストリから科目 id を取り出す ------------------------------------
// id: "xxx" の形だけを拾う。"all" は全科目の仮想 id なので入口を持たない。
function registryIds() {
  const out = [];
  const parts = REGISTRY.split('id: "');
  for (let i = 1; i < parts.length; i++) {
    const end = parts[i].indexOf('"');
    if (end < 0) continue;
    const id = parts[i].slice(0, end);
    if (id === "all") continue;
    if (out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

// --- フッターの科目ナビから href を取り出す ------------------------------
// aria-label で始まり、閉じ nav までを切る。切れなければ空を返す
// (呼び元が「ナビが無い」として落とす)。
function subjectNavHrefs() {
  const at = INDEX.indexOf('aria-label="科目一覧"');
  if (at < 0) return null;
  const end = INDEX.indexOf("</nav>", at);
  if (end < 0) return null;
  const block = INDEX.slice(at, end);
  const out = [];
  const parts = block.split('href="/');
  for (let i = 1; i < parts.length; i++) {
    const q = parts[i].indexOf('"');
    if (q < 0) continue;
    out.push(parts[i].slice(0, q));
  }
  return out;
}

describe("index.html — 科目10本の入口がレジストリとそろっている", () => {
  test("フッターに科目一覧のナビが markup として在る", () => {
    // JavaScript で生成してはいけない。クローラは実行しない。
    expect(INDEX).toContain('aria-label="科目一覧"');
    expect(subjectNavHrefs()).not.toBe(null);
  });

  test("レジストリの科目すべてに、フッターからの入口が在る", () => {
    const hrefs = subjectNavHrefs() || [];
    const missing = registryIds().filter((id) => hrefs.indexOf(id) < 0);
    // 直し方: index.html の aria-label="科目一覧" のナビに
    //   <a href="/<id>">表示名</a> を1行足す。CSS の追加は要らない
    //   (.site-footer-links は flex-wrap で折り返す)。
    expect(missing.join(",")).toBe("");
  });

  test("ナビに、レジストリに無い科目の入口が無い", () => {
    const ids = registryIds();
    const stray = (subjectNavHrefs() || []).filter((h) => ids.indexOf(h) < 0);
    // 直し方: 科目を畳んだなら、この行も消す。リンク先は index.html の
    //   冒頭の known と subjects/registry.js の両方に無いと 404 にはならず、
    //   トップページの複製が返る (rewrites が全パスを index.html に送るため)。
    expect(stray.join(",")).toBe("");
  });
});

describe("index.html — 解析の宣言と実装がそろっている", () => {
  const declares =
    PRIVACY.indexOf("Google アナリティクス") >= 0 &&
    PRIVACY.indexOf("アクセス解析") >= 0;

  test("privacy.html が解析を宣言しているなら、index.html に計測が在る", () => {
    if (!declares) return;
    // 直し方: 計測を消すなら legal/privacy.html の宣言も一緒に消す。
    //   宣言だけ残すと「取ると書いて取っていない」状態になる。
    expect(INDEX).toContain("startAnalytics");
    expect(INDEX).toContain("firebase-analytics-compat");
  });

  test("計測が boot から実際に呼ばれている (定義だけでは走らない)", () => {
    if (!declares) return;
    // 定義と呼び出しの両方を要求する。boot の中の呼び出しは定義より
    // 前の行に在る (関数宣言なので巻き上げで動く) ので、位置では見ない。
    expect(INDEX).toContain("function startAnalytics");
    expect(INDEX).toContain("startAnalytics();");
  });

  test("SDK の URL を字面で書いていない (版ずれと自動リンクを避ける)", () => {
    if (!declares) return;
    // 在るタグの src から文字列置換で作る約束。字面で書くと
    // firebase-app-compat の版とずれ、slack-autolink-guard が見張っている
    // 自動リンクの混入も起きうる。
    expect(INDEX).toContain('replace("firebase-app-compat"');
    expect(INDEX).toContain("tags[i].src");
  });

  test("measurementId が無いときは何も読み込まない", () => {
    if (!declares) return;
    // 設定が空の環境で勝手に計測を試みないこと。
    expect(INDEX).toContain("FIREBASE_CONFIG.measurementId");
  });
});
