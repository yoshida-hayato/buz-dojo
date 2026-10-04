//
// Slack の自動リンクがソースに混入していないことのガード
//
// パッチは Slack のメッセージ本文として運ばれる。Slack は本文の中の
// 「語.既存TLD」に見える字面を、三連バッククォートの中であっても
// 自動でリンク記法に書き換える。2026-10-04 の 05:48便は
// _dev/tools/jest-run.js に global と it をドットでつないだ行を2つ
// 書いたが、it がイタリアのTLDとして解釈され、リンク記法に化けた形で
// main に入った。構文エラーなので、そのファイルは一度も動かなかった。
//
// このズレは、投稿したメッセージを読み返しても見えない(MCP が整形して
// 返す)。main に入ったファイルを読んだときに初めて見える。だから
// ここで機械に見させる。混入したまま入りそうなパッチは、CI がこの1件を
// 落として破棄する。
//
// 検出する字面を、このファイルの中に素のままでは書かない。書くと、
// このファイル自身をパッチとして運ぶときに同じ変換の対象になる。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

const OPEN = "<http";
const OPEN_MAIL = "<mailto";
const BAR = "|";
const CLOSE = ">";

const SKIP_DIRS = new Set([
  ".git", "node_modules", "docs", "src", ".agent-state", "coverage",
]);
const EXTS = new Set([
  ".js", ".css", ".html", ".json", ".rules", ".yml", ".yaml", ".py",
]);

function hasAutolink(line) {
  for (const open of [OPEN, OPEN_MAIL]) {
    const i = line.indexOf(open);
    if (i < 0) continue;
    const b = line.indexOf(BAR, i);
    if (b < 0) continue;
    if (line.indexOf(CLOSE, b) >= 0) return true;
  }
  return false;
}

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(name))) out.push(full);
  }
  return out;
}

describe("Slack の自動リンクの混入", () => {
  const files = walk(ROOT, []);

  test("走査対象のファイルが見つかっている", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test("リンク記法に化けた行が1つも無い", () => {
    const hits = [];
    for (const full of files) {
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (hasAutolink(line)) {
          hits.push(path.relative(ROOT, full) + ":" + (i + 1));
        }
      });
    }
    expect(hits.join(", ")).toBe("");
  });
});
