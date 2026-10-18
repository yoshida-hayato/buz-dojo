//
// 科目一覧の帯 (セクション見出し) の単体テスト。
//
// なぜ必要か: 2026-10-18 21:40 に社長から「じっくり学ぶとかの分類もよくわからない」
// と指摘された。旧分類は2本で、10科目のうち7科目が「じっくり学ぶ」に入り、
// 幅390の実測で2本目の見出しは y=1905 にあった。Excel関数 は「じっくり学ぶ」、
// Outlook と Teams は「すぐ使える」で、同じ Office の道具が別の帯に離れていた。
// 他社12件を調べた結果 (docs/UI_REFERENCE_TOP_PAGE.md): 難易度や思考の深さを
// 帯の見出しに使っていたサイトは0件だった。そこで商品種別の3本に変えた。
//
// 見張るのは4つ。(1) 帯の字面と既定の順 (2) 有効な科目が全部、明示的に表に
// 載っていること (3) 並びの中で帯が連続する = 同じ見出しが2度出ないこと
// (4) 画面の文中に出てくる帯の名前が実在する帯と一致すること。
// 4 が要る理由: 旧分類では index.html と screens-subjects の2箇所が帯の名前を
// 本文に埋め込んでいた。見出しだけ変えると、本文が存在しない帯を指す。
//
// 添字で書いている箇所があるのは、Slack の自動リンクがドット記法を
// 書き換えるのを避けるため (パッチ経路)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (...rel) => fs.readFileSync(path.join(ROOT, ...rel), "utf8");
const REGISTRY = read("subjects", "registry.js");
const SCREENS = read("js", "screens-subjects.js");
const HTML = read("index.html");

const EXAM = ["biz-career", "biz-pm-planning", "biz-pm-operation"];
const TOOLS = ["excel-functions", "windows-shortcuts", "outlook-mail", "teams-collab"];
const SYSTEM = ["sap", "ai-ontology-intro", "ai-ontology-core"];

function ctxAt(nowIso) {
  const fixed = new Date(nowIso).getTime();
  class FixedDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  }
  const ctx = vm.createContext({ Date: FixedDate, Math, JSON, Intl, console, window: {} });
  vm.runInContext(REGISTRY, ctx, { filename: "registry" });
  vm.runInContext(SCREENS, ctx, { filename: "screens-subjects" });
  return ctx;
}

// const の宣言は ctx のプロパティには出ない (同じコンテキストの字句環境に
// 入るだけ)。式として評価して取り出す。function 宣言は ctx から直に見える
function get(ctx, name) {
  return vm.runInContext(name, ctx, { filename: "get" });
}

const NOW = "2026-10-19T00:50:00+09:00";

describe("科目一覧の帯は3本で、字面は商品種別で書く", () => {
  test("帯の字面と既定の順", () => {
    const ctx = ctxAt(NOW);
    const keys = get(ctx, "CATALOG_GROUPS").map((g) => g["key"]);
    const labels = get(ctx, "CATALOG_GROUPS").map((g) => g["label"]);
    expect(keys).toEqual(["tools", "system", "exam"]);
    expect(labels).toEqual([
      "Office とパソコン操作",
      "業務システムと AI",
      "資格・検定の対策",
    ]);
  });

  test("旧分類の字面は js と index.html のどこにも残っていない", () => {
    // 画面に出ていた帯の字面そのもの。331行目の注釈は社長の言葉の引用なので、
    // 括弧つきの完全な字面で見張る
    expect(SCREENS.indexOf("じっくり学ぶ（応用・判断）")).toBe(-1);
    expect(SCREENS.indexOf("すぐ使える（操作）")).toBe(-1);
    expect(HTML.indexOf("じっくり学ぶ（応用・判断）")).toBe(-1);
    expect(HTML.indexOf("すぐ使える（操作）")).toBe(-1);
  });

  test("有効な科目は全部、明示的に表に載っている", () => {
    const ctx = ctxAt(NOW);
    const live = get(ctx, "SUBJECT_REGISTRY").filter((s) => s["enabled"]).map((s) => s["id"]);
    expect(live.length).toBe(10);
    for (const id of live) {
      expect(typeof get(ctx, "CATALOG_GROUP_OF")[id]).toBe("string");
    }
    // 表の側に、もう無い科目を残していないこと
    for (const id of Object.keys(get(ctx, "CATALOG_GROUP_OF"))) {
      expect(live.indexOf(id)).toBeGreaterThan(-1);
    }
  });

  test("どの科目がどの帯か", () => {
    const ctx = ctxAt(NOW);
    const of = (id) => get(ctx, "CATALOG_GROUP_OF")[id];
    for (const id of EXAM) expect(of(id)).toBe("exam");
    for (const id of TOOLS) expect(of(id)).toBe("tools");
    for (const id of SYSTEM) expect(of(id)).toBe("system");
  });

  test("Office の道具4つが同じ帯に居る (旧分類では2つに割れていた)", () => {
    const ctx = ctxAt(NOW);
    const groups = TOOLS.map((id) => get(ctx, "CATALOG_GROUP_OF")[id]);
    expect(groups).toEqual(["tools", "tools", "tools", "tools"]);
  });

  test("表に無い科目は落とさず system へ寄せる", () => {
    const ctx = ctxAt(NOW);
    expect(ctx.catalogGroupOf({ id: "brand-new", depthTier: "depth" })).toBe("system");
    expect(ctx.catalogGroupOf({ id: "brand-new", depthTier: "ops" })).toBe("tools");
  });
});

describe("並びの中で帯は連続する (同じ見出しが2度出ない)", () => {
  const dates = [
    "2026-10-19T00:50:00+09:00",
    "2026-12-05T12:00:00+09:00",
    "2027-01-31T12:00:00+09:00",
    "2027-03-01T12:00:00+09:00",
  ];
  for (const d of dates) {
    test("帯が連続している: " + d, () => {
      const ctx = ctxAt(d);
      const order = ctx.enabledSubjectsSorted();
      expect(order.length).toBe(10);
      const bandsSeen = [];
      let last = null;
      for (const s of order) {
        const g = ctx.catalogGroupOf(s);
        if (g !== last) {
          // 一度離れた帯に戻ってきたら、見出しが2度出る
          expect(bandsSeen.indexOf(g)).toBe(-1);
          bandsSeen.push(g);
          last = g;
        }
      }
      expect(bandsSeen.length).toBe(3);
    });
  }
});

describe("資格の帯は買える時期だけ先頭へ上がる", () => {
  const bandsAt = (iso) => {
    const ctx = ctxAt(iso);
    const seen = [];
    let last = null;
    for (const s of ctx.enabledSubjectsSorted()) {
      const g = ctx.catalogGroupOf(s);
      if (g !== last) {
        seen.push(g);
        last = g;
      }
    }
    return seen;
  };

  test("申込受付中は資格が先頭", () => {
    expect(bandsAt("2026-10-05T12:00:00+09:00")[0]).toBe("exam");
    expect(bandsAt("2026-12-04T12:00:00+09:00")[0]).toBe("exam");
    expect(bandsAt("2026-04-20T12:00:00+09:00")[0]).toBe("exam");
  });

  test("試験14日以内も資格が先頭", () => {
    expect(bandsAt("2027-01-31T12:00:00+09:00")[0]).toBe("exam");
  });

  test("買えない時期は資格を先頭に置かない", () => {
    expect(bandsAt("2026-12-05T12:00:00+09:00")).toEqual(["tools", "system", "exam"]);
    expect(bandsAt("2027-03-01T12:00:00+09:00")).toEqual(["tools", "system", "exam"]);
  });
});

describe("本文が指す帯の名前は、実在する帯の字面と一致する", () => {
  test("科目ピッカーの説明文が名乗る帯が実在する", () => {
    const ctx = ctxAt(NOW);
    const labels = get(ctx, "CATALOG_GROUPS").map((g) => g["label"]);
    // index.html と js の両方に同じ1文が在る。どちらも実在する帯を指すこと
    let hitHtml = 0;
    let hitJs = 0;
    for (const label of labels) {
      if (HTML.indexOf(label) > -1) hitHtml += 1;
      if (SCREENS.indexOf("「" + label + "」の帯") > -1) hitJs += 1;
    }
    expect(hitHtml).toBeGreaterThan(0);
    expect(hitJs).toBeGreaterThan(0);
  });

  test("緑の無料入口は Office とパソコン操作の帯だけに出す", () => {
    expect(SCREENS.indexOf('freeSubject && tier === "tools"')).toBeGreaterThan(-1);
  });
});
