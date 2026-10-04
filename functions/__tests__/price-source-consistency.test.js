/**
 * 「ボタンに出る金額」と「Stripe の請求額」が同じ数から出ることのガード。
 *
 * 請求額: functions/subject-catalog.js が master の catalog.js に問い合わせた
 *         問題数 → 取れないときだけ config/pricing.js の静的な値。
 * 表示額: js/entitlement.js の getSubjectPriceYen。
 *
 * 2026-10-04 までは、開いている科目だけ読込済みの QUIZ_DATA.length を優先して
 * いた。catalog.js は master 側の生成物なので、生成前に問題が増減するとこの1
 * 経路だけ金額がずれる (少なく出れば、表示より高い額を請求する側に倒れる)。
 *
 * jest の置き場所が functions の中だけなのでここに置く。画面側は素のスクリプト
 * なので vm で評価する。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pricing = require("../../config/pricing.js");

const ENTITLEMENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");
const SUBJECT_IDS = Object.keys(pricing.SUBJECT_CATALOG);

/** 画面側を評価する。liveCounts=catalog の件数, quizLength=読込済みの件数 */
function loadEntitlement(opts) {
  const o = opts || {};
  const live = o.liveCounts || {};
  const ctx = {
    console,
    PricingConfig: pricing,
    SubjectCatalog: {
      getQuestionCountSync(id) {
        return typeof live[id] === "number" ? live[id] : 0;
      },
    },
    CURRENT_SUBJECT: o.openSubject ? { id: o.openSubject } : null,
    QUIZ_DATA: new Array(o.quizLength || 0).fill({}),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
  };
  vm.createContext(ctx);
  // const 宣言はコンテキストのプロパティにならないので、同じスクリプトの末尾で渡す
  const src =
    fs.readFileSync(ENTITLEMENT_SRC, "utf8") + "\n;globalThis.__E = Entitlement;";
  vm.runInContext(src, ctx);
  return ctx.__E;
}

/**
 * サーバ側の請求額。fetch を差し替えて件数を与える。subject-catalog は10分の
 * memory cache を持つので、同じ科目を違う件数で2回聞けるよう毎回読み直す。
 */
async function serverYen(subjectId, liveCount) {
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => "questionCount: " + liveCount,
  });
  try {
    jest.resetModules();
    const fresh = require("../subject-catalog");
    return await fresh.getSubjectPriceYenLive(subjectId, pricing);
  } finally {
    global.fetch = realFetch;
  }
}

describe("画面の金額は請求と同じ出どころから出る", () => {
  test("開いている科目でも QUIZ_DATA.length は金額に効かない", () => {
    const id = "biz-career";
    const catalogCount = pricing.SUBJECT_CATALOG[id].questionCount;
    const ent = loadEntitlement({
      liveCounts: { [id]: catalogCount },
      openSubject: id,
      quizLength: catalogCount + 400,
    });
    expect(ent.getSubjectPriceYen(id)).toBe(
      pricing.priceForQuestionCount(catalogCount)
    );
  });

  test("master の件数が動いたら、画面もその件数で動く", () => {
    const id = "biz-career";
    const moved = 1200;
    const ent = loadEntitlement({
      liveCounts: { [id]: moved },
      openSubject: id,
      quizLength: pricing.SUBJECT_CATALOG[id].questionCount,
    });
    expect(ent.getSubjectPriceYen(id)).toBe(pricing.priceForQuestionCount(moved));
  });

  test("catalog.js が取れないときは静的な値に落ちる (サーバと同じ落ち方)", () => {
    const id = "biz-career";
    const ent = loadEntitlement({
      liveCounts: {},
      openSubject: id,
      quizLength: 9999,
    });
    expect(ent.getSubjectPriceYen(id)).toBe(pricing.getSubjectPriceYen(id));
  });

  test("知らない科目は null のまま", () => {
    const ent = loadEntitlement({ liveCounts: {} });
    expect(ent.getSubjectPriceYen("__not_a_real_subject__")).toBeNull();
  });

  test.each(SUBJECT_IDS)("%s: 全科目で画面と請求が一致する (現在の件数)", async (id) => {
    const count = pricing.SUBJECT_CATALOG[id].questionCount;
    const ent = loadEntitlement({
      liveCounts: { [id]: count },
      openSubject: id,
      quizLength: count + 37,
    });
    expect(ent.getSubjectPriceYen(id)).toBe(await serverYen(id, count));
  });

  test.each([100, 101, 822, 823, 2999, 3000])(
    "件数 %i でも画面と請求が一致する",
    async (count) => {
      const id = "biz-career";
      const ent = loadEntitlement({
        liveCounts: { [id]: count },
        openSubject: id,
        quizLength: count + 11,
      });
      expect(ent.getSubjectPriceYen(id)).toBe(await serverYen(id, count));
    }
  );
});
