//
// 科目を切り替えたときに、前の科目のデータが残らないことの見張り
// (js/subject-loader.js)。
//
// なぜ要るか (2026-11-01 に Chromium で実測):
//   changelog.js / lesson.js / tcodes.js / abap-syntax.js はよその repo の
//   マスタで、宣言の書き方がそろっていない。SAP の changelog.js は
//   const CHANGELOG で、学習道場の9科目は var CHANGELOG である。
//   これを script タグで読むと、2度目の読み込みが
//   Identifier CHANGELOG has already been declared で台本ごと落ちる。
//   しかも script の onload は成功として返るので、こちらのコードは
//   失敗に気づかない。さらに const は window の属性ではないため、
//   clearGlobals の window.CHANGELOG = undefined が当たらない。
//   実測した壊れ方: SAP を見たあとに Excel関数へ移ると、ベルの更新履歴が
//   SAP の 2件 (Tコード問題を追加) のまま残り、Excel の1件が出なかった。
//
// 見張る約束は5つ:
//   (1) データ台本は大域に名前を作らない (const でも2度読める)
//   (2) 2度目の読み込みが前の値を必ず上書きする
//   (3) 台本に無い名前は undefined のまま window に書かない
//   (4) clearGlobals が、画面が読む名前をすべて消す
//   (5) 読む側の名前と消す側の名前が一致している (ABAP_SYNTAX の綴り違いの再発防止)
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const SRC = fs.readFileSync(path.join(ROOT, "js", "subject-loader.js"), "utf8");

// window は sandbox の大域そのものにする。ブラウザでは window === globalThis
// なので、window.X への代入が素の X として読めることまで含めて測りたい。
function load(fetchImpl) {
  const injected = [];
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set, Map, Promise, Date, Function,
    URLSearchParams,
    encodeURIComponent,
    console: { warn: () => {}, error: () => {} },
    fetch: fetchImpl,
    localStorage: {
      bag: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this.bag, k) ? this.bag[k] : null; },
      setItem(k, v) { this.bag[k] = String(v); },
      removeItem(k) { delete this.bag[k]; },
    },
    location: { pathname: "/", search: "", hash: "" },
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: {
        appendChild: (el) => {
          injected.push(String(el && el.src));
          if (el && el.onload) el.onload();
        },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const api = vm.runInContext(SRC + NL + "; SubjectLoader;", ctx);
  return { api, win: sandbox, injected };
}

// 足場そのものの見張り。sandbox の window が大域でないと、window.X への
// 代入が素の X として読めず、下の約束が本物の壊れ方を測れない。
describe("約束0: 足場の window が大域そのものである", () => {
  test("window.X への代入が素の X として読める", () => {
    const { api, win } = load(async () => ({ ok: false, text: async () => "" }));
    expect(typeof api).toBe("object");
    win.PROBE_VALUE = 7;
    expect(win.window.PROBE_VALUE).toBe(7);
    expect(win.globalThis).toBe(win);
  });
});

// SAP 側の実物と同じ書き方 (const)
const SAP_CHANGELOG =
  "const CHANGELOG = [" + NL +
  '  { date: "2026-10-20", added: 120, note: "Tコード問題を追加" },' + NL +
  '  { date: "2026-09-30", added: 80, note: "ABAP構文を追加" }' + NL +
  "];" + NL;
// 学習道場側の実物と同じ書き方 (var)
const EXCEL_CHANGELOG =
  "var CHANGELOG = [" + NL +
  '  { date: "2026-09-14", added: 150, note: "Excel関数の初版" }' + NL +
  "];" + NL;

function fetchOf(bodyByUrl) {
  return async (url) => {
    const key = Object.keys(bodyByUrl).find((k) => url.indexOf(k) === 0);
    if (!key) return { ok: false, text: async () => "" };
    return { ok: true, text: async () => bodyByUrl[key] };
  };
}

describe("約束1: データ台本は大域に名前を作らない", () => {
  test("const で書かれた台本を2度続けて評価できる", () => {
    const { api } = load(fetchOf({}));
    const a = api.evalDataScript(SAP_CHANGELOG, ["CHANGELOG"]);
    const b = api.evalDataScript(SAP_CHANGELOG, ["CHANGELOG"]);
    expect(a.CHANGELOG.length).toBe(2);
    expect(b.CHANGELOG.length).toBe(2);
  });

  test("const の台本のあとに var の台本を評価できる", () => {
    const { api } = load(fetchOf({}));
    api.evalDataScript(SAP_CHANGELOG, ["CHANGELOG"]);
    const b = api.evalDataScript(EXCEL_CHANGELOG, ["CHANGELOG"]);
    expect(b.CHANGELOG.length).toBe(1);
    expect(b.CHANGELOG[0].note).toBe("Excel関数の初版");
  });
});
describe("約束4と5: 消す名前と読む名前が一致している", () => {
  const { api, win } = load(fetchOf({}));

  test("clearGlobals が一覧の名前をすべて消す", () => {
    api.DATA_SCRIPT_GLOBALS.forEach((n) => {
      win[n] = ["のこり"];
    });
    api.clearGlobals();
    api.DATA_SCRIPT_GLOBALS.forEach((n) => {
      expect(win[n]).toBeUndefined();
    });
  });

  // 2026-11-01 まで clearGlobals は window.ABAP_SYNTAX を消していたが、
  // 画面が読むのは ABAP_SYNTAX_REF だった。綴りがずれても気づかない形
  // だったので、読む側の字面から名前を取って突き合わせる。
  test("画面が読む大域は、すべて一覧に入っている", () => {
    const readers = {
      "js/syntax-browser.js": ["ABAP_SYNTAX_REF", "ABAP_SYNTAX_GROUP_ORDER"],
      "js/tcode-browser.js": ["TCODE_REF", "TCODE_MODULE_ORDER"],
      "js/app-chrome.js": ["CHANGELOG"],
      "js/lesson-progress.js": ["LESSON_DATA"],
    };
    Object.keys(readers).forEach((file) => {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      readers[file].forEach((name) => {
        expect(text.indexOf(name)).toBeGreaterThan(-1);
        expect(api.DATA_SCRIPT_GLOBALS).toContain(name);
      });
    });
  });

  test("一覧の名前には、必ず読み手が居る", () => {
    const names = fs
      .readdirSync(path.join(ROOT, "js"))
      .filter((f) => f.endsWith(".js") && f !== "subject-loader.js");
    const files = names
      .map((f) => fs.readFileSync(path.join(ROOT, "js", f), "utf8"))
      .join(NL);
    api.DATA_SCRIPT_GLOBALS.forEach((name) => {
      expect(files.indexOf(name)).toBeGreaterThan(-1);
    });
  });
});
describe("約束2: 2度目の読み込みが前の科目の値を上書きする", () => {
  test("SAP のあとに Excel関数を読むと、ベルが読む CHANGELOG が入れ替わる", async () => {
    const { api, win } = load(
      fetchOf({
        "sapdata/changelog.js": SAP_CHANGELOG,
        "exceldata/changelog.js": EXCEL_CHANGELOG,
      })
    );
    await api.loadDataScript("sapdata/changelog.js", "v1", ["CHANGELOG"]);
    expect(win.CHANGELOG.length).toBe(2);
    expect(win.CHANGELOG[0].note).toBe("Tコード問題を追加");

    api.clearGlobals();
    expect(win.CHANGELOG).toBeUndefined();

    await api.loadDataScript("exceldata/changelog.js", "v1", ["CHANGELOG"]);
    expect(win.CHANGELOG.length).toBe(1);
    expect(win.CHANGELOG[0].note).toBe("Excel関数の初版");
  });

  test("逆順 (Excel関数のあとに SAP) でも入れ替わる", async () => {
    const { api, win } = load(
      fetchOf({
        "sapdata/changelog.js": SAP_CHANGELOG,
        "exceldata/changelog.js": EXCEL_CHANGELOG,
      })
    );
    await api.loadDataScript("exceldata/changelog.js", "v1", ["CHANGELOG"]);
    expect(win.CHANGELOG[0].note).toBe("Excel関数の初版");
    api.clearGlobals();
    await api.loadDataScript("sapdata/changelog.js", "v1", ["CHANGELOG"]);
    expect(win.CHANGELOG.length).toBe(2);
    expect(win.CHANGELOG[0].note).toBe("Tコード問題を追加");
  });

  test("同じ科目を2度読んでも落ちない (SAP に戻る筋)", async () => {
    const { api, win } = load(fetchOf({ "sapdata/": SAP_CHANGELOG }));
    await api.loadDataScript("sapdata/changelog.js", "v1", ["CHANGELOG"]);
    api.clearGlobals();
    await api.loadDataScript("sapdata/changelog.js", "v2", ["CHANGELOG"]);
    expect(win.CHANGELOG.length).toBe(2);
  });
});
describe("約束3: 台本に無い名前は window に書かない", () => {
  test("changelog.js を読んでも TCODE_REF は生えない", async () => {
    const { api, win } = load(fetchOf({ "sapdata/": SAP_CHANGELOG }));
    await api.loadDataScript("sapdata/changelog.js", "v1", api.DATA_SCRIPT_GLOBALS);
    expect(win.CHANGELOG.length).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(win, "TCODE_REF")).toBe(false);
  });

  test("取得に失敗したら投げる (黙って成功にしない)", async () => {
    const { api } = load(fetchOf({}));
    let threw = false;
    try {
      await api.loadDataScript("nowhere/changelog.js", "v1", ["CHANGELOG"]);
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
// 約束6が一番大事である。上の約束は loadDataScript を直に呼んで測るので、
// 呼び元を script タグに戻されても気づかない。だから呼び元を実際に走らせ、
// script タグが1本も挿されないことを見る。
describe("約束6: 呼び元が script タグを使わない", () => {
  const SAP_TCODES =
    "const TCODE_REF = [" + NL +
    '  { code: "VA01", module: "SD", name: "受注伝票の登録" }' + NL +
    "];" + NL +
    'const TCODE_MODULE_ORDER = ["SD"];' + NL;

  function withSap(fetchImpl) {
    const h = load(fetchImpl);
    h.win.SUBJECT_REGISTRY = [
      {
        id: "sap",
        enabled: true,
        path: "subjects/sap",
        contentBase: "sapdata",
      },
    ];
    h.win.APP_VERSION = "t1";
    h.win.SUBJECT = { id: "sap", extraScripts: ["tcodes.js", "abap-syntax.js"] };
    return h;
  }

  test("loadExtraScripts は fetch で読み、script を挿さない", async () => {
    const h = withSap(
      fetchOf({
        "sapdata/tcodes.js": SAP_TCODES,
        "sapdata/abap-syntax.js": "const ABAP_SYNTAX_REF = [];" + NL,
      })
    );
    await h.api.loadExtraScripts("sap");
    expect(h.injected).toEqual([]);
    expect(h.win.TCODE_REF.length).toBe(1);
    expect(h.win.TCODE_MODULE_ORDER).toEqual(["SD"]);
    expect(h.win.ABAP_SYNTAX_REF).toEqual([]);
  });

  test("同じ科目に2度入っても落ちず、2度目の中身が入る", async () => {
    const second =
      "const TCODE_REF = [" + NL +
      '  { code: "VA01", module: "SD", name: "受注伝票の登録" },' + NL +
      '  { code: "ME21N", module: "MM", name: "購買発注の登録" }' + NL +
      "];" + NL +
      'const TCODE_MODULE_ORDER = ["SD", "MM"];' + NL;
    let call = 0;
    const h = withSap(async (url) => {
      if (url.indexOf("abap-syntax") > -1) {
        return { ok: true, text: async () => "const ABAP_SYNTAX_REF = [];" + NL };
      }
      call += 1;
      return { ok: true, text: async () => (call === 1 ? SAP_TCODES : second) };
    });
    await h.api.loadExtraScripts("sap");
    expect(h.win.TCODE_REF.length).toBe(1);
    h.api.clearGlobals();
    h.win.SUBJECT = { id: "sap", extraScripts: ["tcodes.js", "abap-syntax.js"] };
    await h.api.loadExtraScripts("sap");
    expect(h.win.TCODE_REF.length).toBe(2);
    expect(h.injected).toEqual([]);
  });

  // 振り分けは loadScript の入口で行う。changelog / lesson / extras は
  // 呼び出しの字面を変えずに隔離経路へ入る。自前の subject.js だけが
  // script タグで入る。ここを外されると、また const が大域に生える。
  test.each([
    ["sapdata/changelog.js", true],
    ["sapdata/lesson.js", true],
    ["sapdata/tcodes.js", true],
    ["sapdata/abap-syntax.js", true],
    ["sapdata/tcodes.js?v=9", true],
    ["subjects/sap/subject.js", false],
    ["subjects/sap/subject.js?v=9", false],
    ["js/quiz-engine.js", false],
  ])("%s を隔離して読むか = %s", (src, want) => {
    const { api } = load(fetchOf({}));
    expect(api.isDataScript(src)).toBe(want);
  });

  // 科目が増えた日に、追加台本が一覧から漏れていないかを見る。
  // 正規表現は使わない (パッチの口が円記号を運べない)。
  test("隔離する一覧が、科目が実際に持つ追加台本を覆っている", () => {
    const { api } = load(fetchOf({}));
    const quote = String.fromCharCode(34);
    const dirs = fs
      .readdirSync(path.join(ROOT, "subjects"))
      .filter((d) => fs.existsSync(path.join(ROOT, "subjects", d, "subject.js")));
    expect(dirs.length).toBeGreaterThan(5);
    const files = new Set(["changelog.js", "lesson.js"]);
    dirs.forEach((id) => {
      const txt = fs.readFileSync(path.join(ROOT, "subjects", id, "subject.js"), "utf8");
      const at = txt.indexOf("extraScripts:");
      if (at === -1) return;
      const open = txt.indexOf("[", at);
      const close = txt.indexOf("]", open);
      if (open === -1 || close === -1) return;
      txt
        .slice(open + 1, close)
        .split(quote)
        .forEach((part, n) => {
          if (n % 2 === 1 && part) files.add(part);
        });
    });
    expect(files.size).toBeGreaterThan(2);
    files.forEach((f) => {
      expect(api.DATA_SCRIPT_FILES).toContain(f);
    });
  });

  test("subject.js は隔離一覧に入っていない (段位の正本は script タグで読む)", () => {
    const { api } = load(fetchOf({}));
    expect(api.DATA_SCRIPT_FILES).not.toContain("subject.js");
    expect(api.DATA_SCRIPT_FILES).not.toContain("questions.js");
  });
});
