// マイページの「無料問題集」「購入不要」が、請求と同じ出どころから出ることのガード。
//
// 2026-10-05 01:48便 までに js/entitlement.js と js/screens-subjects.js の
// ホーム側は catalog.js 優先 (= 請求と同じ) に揃えた。しかし
// js/screens-mypage.js の paintMyPageBilling だけは、まだ
// summary.questionTotal から priceForQuestionCount で金額を出していた。
//
// summary.questionTotal は buildMyPageRows が catalog の件数で埋めるが、
// 途中で例外が出た行 (err = true) では 0 のまま残る。0 問は
// priceForQuestionCount(0) で 0 円 になり、0 円は無料と読まれるので、
// 有料科目に「無料問題集」「購入不要」が出て購入ボタンまで消えていた。
// 一方 Entitlement.hasAccess と remainingFree は有料のまま 1日20問で止めるので、
// 画面は無料と言い、挙動は有料という食い違いになる。
//
// 金額が分からないときに無料へ倒れないことも見る。null を入れると
// null <= 0 が true になるので、不明は NaN で表す (<= 0 も > 0 も false)。
//
// jest の置き場所が functions の中だけなのでここに置く。
// 画面側は素のスクリプトなので vm で評価する。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ROOT = path.join(__dirname, "..", "..");
const ENTITLEMENT_SRC = path.join(ROOT, "js", "entitlement.js");
const MYPAGE_SRC = path.join(ROOT, "js", "screens-mypage.js");
const REGISTRY_SRC = path.join(ROOT, "subjects", "registry.js");

const PAID = "windows-shortcuts";
const FREE = "ai-ontology-intro";

// innerHTML を受け取るだけの最小の要素
function stubEl() {
  return {
    innerHTML: "",
    textContent: "",
    parentElement: null,
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

// マイページの課金ブロックを描いて、出来た HTML と Entitlement を返す。
// liveCounts = catalog.js 側の件数 / rows = buildMyPageRows が返す形
function renderBilling(opts) {
  const o = opts || {};
  const live = o.liveCounts || {};
  const store = {};
  const ctx = {
    console,
    PricingConfig: pricing,
    SubjectCatalog: {
      getQuestionCountSync(id) {
        return typeof live[id] === "number" ? live[id] : 0;
      },
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
    },
    escapeHtml: (v) => String(v == null ? "" : v),
    $: () => null,
    PACK_PLAN: { id: "all", title: "プレミアムパック", priceYen: pricing.PACK_PRICE_YEN },
  };
  vm.createContext(ctx);
  // const 宣言はコンテキストのプロパティにならないので、同じスクリプトの末尾で渡す
  vm.runInContext(
    fs.readFileSync(ENTITLEMENT_SRC, "utf8") + "\n;globalThis.Entitlement = Entitlement;",
    ctx
  );
  // 最上位は宣言だけなので、読み込んでも副作用は無い
  vm.runInContext(fs.readFileSync(MYPAGE_SRC, "utf8"), ctx);
  const el = stubEl();
  ctx.paintMyPageBilling(el, o.rows || []);
  return { html: el.innerHTML, ent: ctx.Entitlement };
}

// 科目1件ぶんの行。questionTotal を 0 にすると catalog が取れなかった状態
function row(id, questionTotal, err) {
  return {
    s: { id, title: id, shortTitle: id },
    summary: { questionTotal: questionTotal || 0 },
    subjectSummary: { answered: 0, correct: 0, masteredChoice: 0, daily: {} },
    err: !!err,
  };
}

describe("マイページの無料表示は、請求と同じ出どころから出る", () => {
  test("有料科目: 読込に失敗した行 (questionTotal 0) でも無料と言わない", () => {
    const { html } = renderBilling({
      liveCounts: { [PAID]: 400 },
      rows: [row(PAID, 0, true)],
    });
    expect(html).not.toContain("無料問題集");
    expect(html).not.toContain("購入不要");
  });

  test("有料科目: 読込に失敗した行でも購入ボタンは残る", () => {
    const { html } = renderBilling({
      liveCounts: { [PAID]: 400 },
      rows: [row(PAID, 0, true)],
    });
    expect(html).toContain("mypage-buy-subject");
  });

  test("有料科目: questionTotal が 0 でも金額は catalog から出る", () => {
    const { html, ent } = renderBilling({
      liveCounts: { [PAID]: 400 },
      rows: [row(PAID, 0, false)],
    });
    expect(html).toContain(ent.formatPrice(pricing.priceForQuestionCount(400)));
  });

  test("有料科目: questionTotal が catalog とずれていても catalog を見る", () => {
    const { html, ent } = renderBilling({
      liveCounts: { [PAID]: 400 },
      rows: [row(PAID, 150, false)],
    });
    expect(html).toContain(ent.formatPrice(pricing.priceForQuestionCount(400)));
    expect(html).not.toContain(ent.formatPrice(pricing.priceForQuestionCount(150)));
  });

  test("無料科目は「無料問題集」「購入不要」のまま (ロック側に倒していない)", () => {
    const { html } = renderBilling({
      liveCounts: { [FREE]: 60 },
      rows: [row(FREE, 60, false)],
    });
    expect(html).toContain("無料問題集");
    expect(html).toContain("購入不要");
  });

  test("catalog にも静的値にも無い科目は、無料にしない", () => {
    const { html } = renderBilling({ liveCounts: {}, rows: [row("no-such-subject", 0, false)] });
    expect(html).not.toContain("無料問題集");
    expect(html).not.toContain("購入不要");
    expect(html).toContain("mypage-buy-subject");
  });

  test("公開中の全科目で、マイページの金額と請求の金額が一致する", () => {
    const ids = Object.keys(pricing.SUBJECT_CATALOG);
    const liveCounts = ids.reduce((acc, id) => {
      acc[id] = pricing.SUBJECT_CATALOG[id].questionCount;
      return acc;
    }, {});
    ids.forEach((id) => {
      const yen = pricing.getSubjectPriceYen(id);
      // questionTotal をわざと食い違わせても、出る金額は動かない
      const { html, ent } = renderBilling({ liveCounts, rows: [row(id, 3, false)] });
      if (yen > 0) {
        expect(html).toContain(ent.formatPrice(yen));
      } else {
        expect(html).toContain("無料問題集");
      }
    });
  });
});

describe("registry と config/pricing.js の科目表がずれていない", () => {
  // ずれた瞬間に、その科目は画面上だけ 0 円 = 無料になる。
  // js/subject-catalog.js の fallbackCount は 静的値 → registry の
  // questionCount の順に落ちるが、registry 側は questionCount を持たないので、
  // 静的表から漏れた科目は 0 件扱いになる。社長が科目を追加していく前提なので、
  // 漏れた瞬間に赤くなる形にしておく。
  const registryIds = (() => {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(
      fs.readFileSync(REGISTRY_SRC, "utf8") + "\n;globalThis.__R = SUBJECT_REGISTRY;",
      ctx
    );
    return ctx.__R.filter((s) => s.enabled !== false).map((s) => s.id);
  })();

  test("公開中の科目が1件以上ある", () => {
    expect(registryIds.length).toBeGreaterThan(0);
  });

  test.each(registryIds.map((id) => [id]))(
    "%s は config/pricing.js の SUBJECT_CATALOG にあり、問題数が 0 より大きい",
    (id) => {
      const meta = pricing.SUBJECT_CATALOG[id];
      expect(meta).toBeDefined();
      expect(Number(meta.questionCount)).toBeGreaterThan(0);
    }
  );
});
