//
// キャッシュ鍵の自動生成のガード (_dev/gen-version.py と hosting.predeploy)。
//
// なぜ要るか: 2026-10-11 は13件のコミットが main に入ったのに、鍵
// (config/version.js の APP_VERSION) が前日のままで、再訪ユーザーには
// 1バイトも届かなかった。鍵の更新が人の記憶に預けられていたためである。
// 自動改善が毎時 js と css を書き換える運用では、毎回忘れると思うほうが正しい。
//
// 鍵は中身の指紋から作る。時刻から作ると、中身が1バイトも変わっていない
// デプロイでも鍵が動き、スマホに更新ポップアップが出る
// (js/app-chrome.js の ensureAppUpdateBeforeLoad は鍵が変わると問題読込の前に
// ポップアップを出す)。1日に何度もデプロイが走るので、時刻由来は使えない。
//
// 台本は実行しない。実行すると config/version.js を書き換えてしまい、
// apply-patch の行数チェック (repo 全体の差分を数える) を以後のパッチが食う。
// ここは字面と JSON だけを読む。正規表現は使わない (パッチ経路に量指定子を通せない)。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const FIREBASE = JSON.parse(read("firebase.json"));
const GEN = read("_dev/gen-version.py");
const Q = String.fromCharCode(34);

// 台本の GUARDED タプルに並んでいるディレクトリ名
function guardedInScript() {
  const i = GEN.indexOf("GUARDED = (");
  if (i < 0) return [];
  const end = GEN.indexOf(")", i);
  const parts = GEN.slice(i, end).split(Q);
  const out = [];
  for (let k = 1; k < parts.length; k += 2) out.push(parts[k]);
  return out;
}

// firebase.json が immutable で配っている source の第1階層
function immutableTops() {
  const out = [];
  const rows = FIREBASE.hosting.headers || [];
  for (let i = 0; i < rows.length; i += 1) {
    const hs = rows[i].headers || [];
    for (let j = 0; j < hs.length; j += 1) {
      if (hs[j].key !== "Cache-Control") continue;
      if (hs[j].value.indexOf("immutable") < 0) continue;
      const top = rows[i].source.split("/")[1];
      if (top && out.indexOf(top) < 0) out.push(top);
    }
  }
  return out;
}

describe("キャッシュ鍵の自動生成", () => {
  test("hosting.predeploy が gen-version を呼んでいる", () => {
    expect((FIREBASE.hosting.predeploy || []).join(" ").indexOf("_dev/gen-version.py") >= 0).toBe(true);
  });

  test("immutable で配っている階層は、すべて指紋の対象に入っている", () => {
    // ここが落ちるのは、新しいディレクトリを immutable で配りはじめたとき。
    // 鍵が動かない階層が1つでもあると、そこだけ去年の中身が1年残る。
    const covered = guardedInScript();
    immutableTops().forEach((top) => {
      expect(covered.indexOf(top) >= 0).toBe(true);
    });
  });

  test("鍵そのものは指紋から外している (自分を数えると値が決まらない)", () => {
    expect(GEN.indexOf("config/version.js") >= 0).toBe(true);
    expect(GEN.indexOf("SKIP = (") >= 0).toBe(true);
  });

  test("本体と互換シムの両方を書く", () => {
    expect(GEN.indexOf('write("config/version.js"') >= 0).toBe(true);
    expect(GEN.indexOf('write("data/version.js"') >= 0).toBe(true);
  });

  test("直前の鍵は本番から読み、指紋が一致したら動かさない", () => {
    // repo の config/version.js は predeploy の書き込みを commit できないので
    // 必ずずれる。いま利用者が握っている値のほうが正しい。
    expect(GEN.indexOf("/config/version.js") >= 0).toBe(true);
    expect(GEN.indexOf('endswith("-v" + digest)') >= 0).toBe(true);
  });

  test("何があっても終了コード0で抜ける (デプロイを落とさない)", () => {
    expect(GEN.indexOf("sys.exit(0)") >= 0).toBe(true);
    expect(GEN.indexOf("except Exception") >= 0).toBe(true);
  });
});
