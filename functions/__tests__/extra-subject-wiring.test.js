// レジストリが2枚に割れたことを見張る。
//
// subjects/registry.js は自動パッチの対象外なので、社員が足せる科目は
// config/extra-subjects.js に入る。つまり「科目の一覧」が2箇所になった。
// 2箇所に割れた表は、片方だけ直して終わるのが常である (この repo で4度やった)。
// だからここで、割れた側が本体と同じ配線を全部持つことを機械に見させる。
//
// 正規表現は使わない (パッチの口が円記号を運べない)。indexOf と split で組む。
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const QUOTE = String.fromCharCode(34);
const NL = String.fromCharCode(10);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const extras = require(path.join(ROOT, "config", "extra-subjects.js"));

// registry.js から enabled な id を拾う。gen-seo.py と同じ素朴な切り出し。
function registryIds() {
  const text = read(path.join("subjects", "registry.js"));
  const out = [];
  const parts = text.split("id: " + QUOTE);
  parts.slice(1).forEach(function (part) {
    const end = part.indexOf(QUOTE);
    if (end < 0) return;
    const id = part.slice(0, end);
    if (id === "all" || out.indexOf(id) > -1) return;
    if (part.indexOf("enabled: true") < 0) return;
    out.push(id);
  });
  return out;
}

describe("約束1: 2枚目のレジストリが、読む順番どおりに配線されている", () => {
  test("index.html は registry.js の直後に extra-subjects.js を読む", () => {
    const text = read("index.html");
    const a = text.indexOf("subjects/registry.js");
    const b = text.indexOf("config/extra-subjects.js");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(-1);
    // 直後であること。間に別の行が入ると、間の行が古い一覧を見る
    expect(text.slice(a, b).split(NL).length).toBe(2);
  });

  test("管理画面の2枚も同じ順で読む", () => {
    ["admin/reports.html", "admin/question-analytics.html"].forEach(function (rel) {
      const text = read(rel);
      const a = text.indexOf("subjects/registry.js");
      const b = text.indexOf("config/extra-subjects.js");
      expect(a).toBeGreaterThan(-1);
      expect(b).toBeGreaterThan(a);
      expect(text.slice(a, b).split(NL).length).toBe(2);
    });
  });

  // 註の中の字面では駄目。効いている式そのものを見る。
  // 註を落としてから、2枚とも path を組む行が在ることを確かめる。
  test("静的な頁の台本が、2枚目も式として読んでいる", () => {
    const raw = read(path.join("_dev", "gen-seo.py"));
    const code = raw
      .split(NL)
      .filter(function (line) {
        return line.trim().indexOf("#") !== 0;
      })
      .join(NL);
    const at = code.indexOf("def enabled_subject_ids");
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at, at + 900);
    expect(body.indexOf(QUOTE + "registry.js" + QUOTE)).toBeGreaterThan(-1);
    expect(body.indexOf(QUOTE + "extra-subjects.js" + QUOTE)).toBeGreaterThan(-1);
  });
});
