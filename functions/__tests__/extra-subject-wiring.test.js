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
describe("約束2: 足し方が、既に参照を持った側を壊さない", () => {
  // 本物の行を注入して測る。一覧が空でも約束が効くようにするため。
  const PROBE = [
    { id: "zz-one", title: "p" },
    { id: "zz-two", title: "p" },
    { id: "zz-one", title: "p" },
    { title: "id が無い行" },
    null,
  ];

  test("mergeRows は同じ配列に push する (差し替えない)", () => {
    const list = [{ id: "sap" }];
    const held = list;
    const got = extras.mergeRows(list, PROBE);
    expect(got).toBe(held);
    expect(list[0].id).toBe("sap");
  });

  test("同じ id は2度足さない", () => {
    const list = [];
    extras.mergeRows(list, PROBE);
    const n = list.filter(function (r) {
      return r.id === "zz-one";
    }).length;
    expect(n).toBe(1);
  });

  test("既に在る id は足さない", () => {
    const list = [{ id: "zz-two" }];
    extras.mergeRows(list, PROBE);
    expect(list.length).toBe(2);
    expect(extras.idsOf(list)).toEqual(["zz-two", "zz-one"]);
  });

  test("id が無い行と null は足さない", () => {
    const list = [];
    extras.mergeRows(list, PROBE);
    expect(list.length).toBe(2);
    list.forEach(function (r) {
      expect(typeof r.id).toBe("string");
      expect(r.id.length).toBeGreaterThan(0);
    });
  });

  test("idsOf は id を持つ行だけを、順番どおりに数える", () => {
    expect(extras.idsOf(PROBE)).toEqual(["zz-one", "zz-two", "zz-one"]);
    expect(extras.idsOf(null)).toEqual([]);
  });

  // mergeInto が EXTRA_SUBJECTS 以外の物を足していないことまで見る。
  // 一覧が空のときは「足さない壊し方」は観測できない (何も起きないので
  // 正しい振る舞いと区別が付かない)。足す壊し方だけが捕まる。
  test("mergeInto は EXTRA_SUBJECTS の行だけを足す", () => {
    const list = [];
    extras.mergeInto(list);
    const want = extras.EXTRA_SUBJECTS.filter(function (r) {
      return r && r.id;
    });
    expect(list.length).toBe(want.length);
    list.forEach(function (row, n) {
      expect(row).toBe(want[n]);
    });
    expect(extras.idsOf(list)).toEqual(extras.ids());
    expect(extras.ids()).toEqual(extras.idsOf(extras.EXTRA_SUBJECTS));
  });
});

describe("約束3: 2枚のレジストリの id が重ならない", () => {
  test("registry と extra-subjects に同じ id が無い", () => {
    const reg = registryIds();
    expect(reg.length).toBeGreaterThan(5);
    extras.ids().forEach(function (id) {
      expect(reg.indexOf(id)).toBe(-1);
    });
  });
});

// ここから下は、2枚目に科目が1本でも入った日に効く。
// 空のうちは何も主張しないが、1本入れると足し忘れを名指しで落とす。
describe("約束4: 2枚目の科目が、本体と同じ配線を全部持つ", () => {
  const rows = extras.EXTRA_SUBJECTS;

  const cases = [];
  rows.forEach(function (r) {
    cases.push([r.id, r]);
  });
  if (!cases.length) cases.push(["(無し)", null]);

  test.each(cases)(
    "%s の配線がそろっている",
    (id, row) => {
      if (!row) {
        expect(rows.length).toBe(0);
        return;
      }
      // 問題データはこちら側に在る。よそのドメインを指していたら、
      // この2枚目を作った理由そのものが消える
      expect(typeof row.contentBase).toBe("string");
      expect(row.contentBase.indexOf(":")).toBe(-1);
      expect(row.contentBase.length).toBeGreaterThan(0);
      expect(typeof row.title).toBe("string");
      expect(typeof row.description).toBe("string");
      expect(row.path).toBe("subjects/" + id);

      // 段位と branding
      expect(fs.existsSync(path.join(ROOT, "subjects", id, "subject.js"))).toBe(true);

      // 料金の正本
      const pricing = require(path.join(ROOT, "config", "pricing.js"));
      const meta = pricing.SUBJECT_CATALOG[id];
      expect(meta).toBeTruthy();
      expect(typeof meta.questionCount).toBe("number");
      expect(typeof meta.sourceType).toBe("string");

      // 帯の表 / 静的な題 / フッターの入口 / 成績キーの控え
      expect(read(path.join("js", "screens-subjects.js")).indexOf(QUOTE + id + QUOTE)).toBeGreaterThan(-1);
      const html = read("index.html");
      expect(html.indexOf(QUOTE + id + QUOTE + ":")).toBeGreaterThan(-1);
      expect(html.indexOf("/" + id + QUOTE)).toBeGreaterThan(-1);
      expect(read(path.join("functions", "question-stats-paths.js")).indexOf(QUOTE + id + QUOTE)).toBeGreaterThan(-1);
      expect(read(path.join("js", "question-stats-paths.js")).indexOf(QUOTE + id + QUOTE)).toBeGreaterThan(-1);

      // 道ごとの Content-Type と no-cache
      const hosting = JSON.parse(read("firebase.json")).hosting;
      const hit = (hosting.headers || []).filter(function (h) {
        return h.source === "/" + id;
      });
      expect(hit.length).toBe(1);
      const keys = [];
      hit[0].headers.forEach(function (h) {
        keys.push(h.key);
      });
      expect(keys).toContain("Content-Type");
      expect(keys).toContain("Cache-Control");
    }
  );
});

describe("約束5: 公開情報を名乗る科目は、許諾の台帳に裏付けが在る", () => {
  const rows = extras.EXTRA_SUBJECTS;
  test("sourceType が公開過去問なら、許諾が granted の試験を指している", () => {
    if (!rows.length) {
      expect(rows.length).toBe(0);
      return;
    }
    const pricing = require(path.join(ROOT, "config", "pricing.js"));
    const licenses = require(path.join(ROOT, "config", "exam-licenses.js"));
    rows.forEach(function (row) {
      const meta = pricing.SUBJECT_CATALOG[row.id] || {};
      if (meta.sourceType !== pricing.SOURCE_PUBLIC_PAST_EXAM) return;
      expect(typeof row.examLicenseKey).toBe("string");
      const lic = licenses.get(row.examLicenseKey);
      expect(lic).toBeTruthy();
      expect(lic.status).toBe("granted");
    });
  });
});
