//
// 科目10本の URL に、科目ごとの静的な頁を置く仕掛けのガード。
//
// 何を直したか: firebase.json の rewrites が全パスを index.html に送るので、
// /sap も /excel-functions も、描画しないクローラには題も説明も正典も同じ
// 頁として見えていた (11本が互いの複製)。_dev/gen-seo.py が、デプロイのたびに
// index.html を写して head の札だけ科目のものに替えた実ファイルを書き出す。
// 完全一致の静的ファイルは rewrites より上位なので、これが在れば /sap は
// 自分の札を持った頁を返す。無ければ従来どおりトップが返る (壊れない)。
//
// なぜ Content-Type を道ごとに被せるか: 置けるのは拡張子の無いファイルだけで
// (URL が /sap なので)、拡張子が無いと既定の型が決まらない。10/26 00:48便 に
// 手元で実測したところ、型を被せない配信ではブラウザが頁を描かずに保存を
// 始めた。つまり被せ忘れた科目の URL は、利用者から見ると壊れる。
// 科目を増やしたときに此処を忘れるのがいちばん静かな壊れ方なので、
// レジストリと firebase.json を突き合わせて数える。
//
// 台本そのものをテストから実行してはいけない (公開ディレクトリに追跡外の
// ファイルができ、apply-patch の行数チェックが以後のパッチを食い潰す)。
// だから台本側は字面で、設定側は実データで見張る。
//
// 正規表現は使わない。indexOf と JSON で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const FIREBASE = JSON.parse(read("firebase.json"));
const GEN = read("_dev/gen-seo.py");
const INDEX = read("index.html");
const REGISTRY = read("subjects/registry.js");

// 入口を持つ科目 = レジストリで enabled: true のもの。台本と同じ切り出し方。
function enabledIds() {
  const out = [];
  const parts = REGISTRY.split('id: "');
  for (let i = 1; i < parts.length; i++) {
    const end = parts[i].indexOf('"');
    if (end < 0) continue;
    const id = parts[i].slice(0, end);
    if (id === "all" || out.indexOf(id) >= 0) continue;
    if (parts[i].indexOf("enabled: true") < 0) continue;
    out.push(id);
  }
  return out;
}

function typedPaths() {
  const out = [];
  (FIREBASE.hosting.headers || []).forEach((rule) => {
    const typed = (rule.headers || []).filter(
      (h) => h.key === "Content-Type" && String(h.value).indexOf("text/html") >= 0
    );
    if (typed.length > 0) out.push(rule.source);
  });
  return out;
}

describe("科目ごとの静的な頁 — 台本が書き、設定が型を被せる", () => {
  test("科目が1本以上在る (この表が空なら以下は何も見張れない)", () => {
    expect(enabledIds().length > 0).toBe(true);
  });

  test("入口を持つ科目すべてに text/html の被せが在る", () => {
    // 直し方: firebase.json の headers に "/科目id" の行を1本足す。
    // 忘れると、その科目の URL はブラウザが保存しようとする (実測)。
    const typed = typedPaths();
    const missing = enabledIds().filter((id) => typed.indexOf("/" + id) < 0);
    expect(missing.join(",")).toBe("");
  });

  test("被せは1科目1本だけ (重なると後ろが黙って勝つ)", () => {
    const typed = typedPaths();
    const dup = enabledIds().filter(
      (id) => typed.filter((s) => s === "/" + id).length > 1
    );
    expect(dup.join(",")).toBe("");
  });

  test("台本が科目の頁を書き、main から呼ばれている", () => {
    expect(GEN.indexOf("def write_subject_pages()") >= 0).toBe(true);
    expect(GEN.indexOf("    write_subject_pages()") >= 0).toBe(true);
    // 拡張子を付けない (URL が /sap なので、付けると完全一致しない)
    expect(GEN.indexOf("write(sid, body)") >= 0).toBe(true);
  });

  test("題と説明は index.html の known から読む (写さない)", () => {
    // 正本が2つに分かれると、片方だけ直したときに検索結果が古いままになる。
    expect(GEN.indexOf('index_text.find("var known = {")') >= 0).toBe(true);
    expect(GEN.indexOf('"index.html"') >= 0).toBe(true);
  });

  test("差し替え先が1つでも見つからなければ、その頁を書かない", () => {
    // 半分だけ替わった頁を本番に出さない。書かなければトップが返るだけで済む。
    expect(GEN.indexOf("if not all(steps):") >= 0).toBe(true);
  });

  test("静的な正典が在れば起動時の script は使い回す (2本出さない)", () => {
    expect(INDEX.indexOf('document.getElementById("canonical-link") ||') >= 0).toBe(true);
    expect(INDEX.indexOf("if (!canonical.parentNode) document.head.appendChild(canonical)") >= 0).toBe(true);
  });
});
