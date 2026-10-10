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

// --- 10/11 03:48便で足した分 -------------------------------------------
//
// 科目10本の URL は、すべて同じ index.html が返る (firebase.json の rewrites)。
// 10/11 02:48 に本番の /sap を読んだら、題も説明もトップと同一、canonical は
// 無しだった。head 冒頭の known を slug から 題と説明 の表に変えて直した。
// 見張るのは2つ。表がレジストリとそろっていること。そして題と説明に問題数と
// 金額を書かないこと (請求額は master の件数から動く。subject-content-urls
// の前書きを見よ。静的な字面に写すと検索結果だけが古い数字を言い続ける)。
// 正規表現は使わない。すべて indexOf と slice で読む。
//
const DIGITS = "0123456789" + String.fromCharCode(0xff10, 0xff11, 0xff12, 0xff13, 0xff14, 0xff15, 0xff16, 0xff17, 0xff18, 0xff19);
const YENS = String.fromCharCode(0xa5) + String.fromCharCode(0xffe5);

function hasDrifty(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (DIGITS.indexOf(c) >= 0) return true;
    if (YENS.indexOf(c) >= 0) return true;
  }
  return s.indexOf("円") >= 0;
}

// head 冒頭の known を [{ id, title, desc }] に読む。1行1科目を前提にする。
function knownEntries() {
  const at = INDEX.indexOf("var known = {");
  if (at < 0) return null;
  const end = INDEX.indexOf("};", at);
  if (end < 0) return null;
  const out = [];
  for (const line of INDEX.slice(at, end).split("\n")) {
    const lb = line.indexOf('["');
    const colon = line.indexOf(":");
    const rb = line.lastIndexOf('"]');
    if (lb < 0 || colon < 0 || rb < 0) continue;
    if (colon > lb) continue;
    let key = line.slice(0, colon).trim();
    if (key.charAt(0) === '"') key = key.slice(1, key.length - 1);
    const inner = line.slice(lb + 2, rb);
    const sep = inner.indexOf('", "');
    if (sep < 0) continue;
    out.push({ id: key, title: inner.slice(0, sep), desc: inner.slice(sep + 4) });
  }
  return out;
}

describe("index.html — 科目パスの題と説明がそろっている", () => {
  test("known が 題と説明 の表として読める", () => {
    // 直し方: known の1行は slug: 題と説明の2要素配列 を1行に収める。
    expect(knownEntries()).not.toBe(null);
    expect((knownEntries() || []).length).toBe(registryIds().length);
  });

  test("レジストリの科目すべてに題と説明が在り、余りが無い", () => {
    const ids = (knownEntries() || []).map((e) => e.id);
    expect(registryIds().filter((id) => ids.indexOf(id) < 0).join(",")).toBe("");
    expect(ids.filter((id) => registryIds().indexOf(id) < 0).join(",")).toBe("");
  });

  test("題も説明も空でない", () => {
    const empty = (knownEntries() || [])
      .filter((e) => e.title.length < 4 || e.desc.length < 10)
      .map((e) => e.id);
    expect(empty.join(",")).toBe("");
  });

  test("題と説明が10本とも互いに違う", () => {
    // 重なっていると、その2本は検索エンジンに同じページとして見える。
    const got = knownEntries() || [];
    const t = [];
    const d = [];
    got.forEach((e) => {
      if (t.indexOf(e.title) < 0) t.push(e.title);
      if (d.indexOf(e.desc) < 0) d.push(e.desc);
    });
    expect(t.length).toBe(got.length);
    expect(d.length).toBe(got.length);
  });

  test("題と説明に問題数と金額を書いていない", () => {
    // 直し方: 数字と金額はここに書かない。言いたいなら、値段の出どころが
    //   pricing である画面側 (js) で出すこと。
    const bad = (knownEntries() || [])
      .filter((e) => hasDrifty(e.title) || hasDrifty(e.desc))
      .map((e) => e.id);
    expect(bad.join(",")).toBe("");
  });

  test("差し替える先の meta タグが head に在る", () => {
    // 差し替え先が無いと setMeta は黙って何もしない。
    expect(INDEX).toContain('meta name="description"');
    expect(INDEX).toContain('meta property="og:title"');
    expect(INDEX).toContain('meta property="og:description"');
  });

  test("科目パスのときに題・説明・og を差し替えている", () => {
    expect(INDEX).toContain("document.title = hit[0]");
    expect(INDEX).toContain('meta[name="description"]');
    expect(INDEX).toContain('meta[property="og:title"]');
    expect(INDEX).toContain('meta[property="og:description"]');
  });

  test("canonical を1本だけ作って head に付けている", () => {
    // rewrites のせいで、どんなパスでもトップの複製が 200 で返る。
    // 知らないパスはトップへ寄せ、科目パスは自分自身を正典にする。
    expect(INDEX).toContain('setAttribute("rel", "canonical")');
    expect(INDEX).toContain("location.origin");
    expect(INDEX).toContain("document.head.appendChild(canonical)");
    // 静的な canonical タグを別に置かないこと (2本出ると無視される)。
    expect(INDEX.indexOf('rel="canonical"')).toBe(-1);
  });
});
