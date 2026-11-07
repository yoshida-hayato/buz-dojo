// package.json と firebase.json が「走らせる」と宣言している台本が、
// 実際に repo に在るかの見張り。
//
// なぜ要るか (2026-11-07 に実測): package.json は test:mini で
// scripts/minijest.js を指していたのに、そのファイルが repo に無かった。
// npm run test:mini は呼んだ人のところで必ず失敗する。どのテストもここを
// 見ていなかったので、気づかずに日が経ち、社員は便ごとに同じランナーを
// 書き直していた (10/31 に2回、11/1、11/2)。
// firebase.json の predeploy も同じ形なので、一緒に見る。ここが欠けると
// デプロイが止まり、hosting も functions も1バイトも出ない。
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

// 台本の字面から、repo の中のファイルを指している語だけを拾う。
function scriptTargets(pkgRel) {
  const pkgDir = path.dirname(path.join(ROOT, pkgRel));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, pkgRel), "utf8"));
  const out = [];
  Object.keys(pkg.scripts || {}).forEach(function (key) {
    String(pkg.scripts[key]).split(" ").forEach(function (word) {
      const w = word.split('"').join("");
      if (w.indexOf("/") < 0) return;
      const tail = w.slice(-3);
      if (tail !== ".js" && tail !== ".py") return;
      out.push({ where: pkgRel + " " + key, word: w, full: path.resolve(pkgDir, w) });
    });
  });
  return out;
}

// firebase.json の predeploy と postdeploy を、入れ子のどこに在っても拾う。
function deployTargets() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
  const out = [];
  function collect(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    Object.keys(node).forEach(function (k) {
      if (k === "predeploy" || k === "postdeploy") {
        const list = Array.isArray(node[k]) ? node[k] : [node[k]];
        list.forEach(function (cmd) {
          String(cmd).split(" ").forEach(function (w) {
            if (w.indexOf("/") < 0) return;
            const tail = w.slice(-3);
            if (tail === ".js" || tail === ".py") {
              out.push({ where: "firebase.json " + k, word: w, full: path.join(ROOT, w) });
            }
          });
        });
        return;
      }
      collect(node[k]);
    });
  }
  collect(cfg);
  return out;
}

const ALL = scriptTargets("package.json")
  .concat(scriptTargets(path.join("functions", "package.json")))
  .concat(deployTargets());

describe("宣言された台本が実在する", () => {
  test("拾えている (拾えていないと、この見張りは何も主張しない)", () => {
    // 検算: 2026-11-07 の時点で4本 (test:mini / pretest / predeploy 2本の
    //   gen-seo と gen-version / functions の predeploy)。増えてもよいが、
    //   0 や 1 に落ちたら拾い方が壊れている。
    expect(ALL.length).toBeGreaterThan(3);
  });

  test("指された台本が全部在る", () => {
    // 直し方: ファイルを置くか、宣言の行を消すか、どちらかにする。
    //   指すだけで置かないと、その台本は呼んだ人のところで必ず失敗する。
    const missing = ALL.filter(function (t) {
      return !fs.existsSync(t.full);
    }).map(function (t) {
      return t.where + " -> " + t.word;
    });
    expect(missing.join(", ")).toBe("");
  });
});
