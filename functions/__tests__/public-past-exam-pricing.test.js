// 公開過去問の科目は、問題数に関わらず無料であることのガード。
//
// なぜ要るか (2026-10-26 社長指示):
//   「公開情報の過去問は無料枠。独自で作った問題だけ有料」。
//   ところが値付けは問題数だけで決まっていた。基本情報のように公開過去問が
//   数千問ある科目を足すと、規則の逆 — 上限額 — が自動で付く。
//
//   しかも金額を出す経路は3つある。
//     正本: config/pricing.js の getSubjectPriceYen
//     画面: js/entitlement.js の getSubjectPriceYen (catalog の実件数を見る)
//     請求: functions/subject-catalog.js の getSubjectPriceYenLive (同じ)
//   後ろの2つは priceForQuestionCount を直に呼んでいたので、正本だけ直すと
//   「カードに金額が出るのに、押すと決済セッションが作られない」画面になる
//   (getPlanLineItem は0円の単品を弾く)。だから3経路を同時に見張る。
//
// 壊し方の想定 (どれでも落ちること):
//   - 科目を足すとき sourceType を書き忘れる
//   - sourceType に知らない値を書く
//   - 正と写し (functions/pricing-shared.js) の片方だけ直す
//   - 3経路のどれかを priceForQuestionCount に戻す
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const client = require("../../config/pricing.js");
const server = require("../pricing-shared.js");

const ENTITLEMENT_SRC = path.join(__dirname, "..", "..", "js", "entitlement.js");

const FAKE_ID = "__public_past_exam_probe__";
const FAKE_COUNT = 4951;

function loadEntitlement(liveCounts) {
  const live = liveCounts || {};
  const ctx = {
    console,
    PricingConfig: client,
    SubjectCatalog: {
      getQuestionCountSync(id) {
        return typeof live[id] === "number" ? live[id] : 0;
      },
    },
    CURRENT_SUBJECT: null,
    QUIZ_DATA: [],
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  vm.createContext(ctx);
  const src =
    fs.readFileSync(ENTITLEMENT_SRC, "utf8") + "\n;globalThis.__E = Entitlement;";
  vm.runInContext(src, ctx);
  return ctx.__E;
}

async function serverYen(subjectId, liveCount, pricing) {
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

describe("出どころの宣言", () => {
  test("すべての科目が sourceType を明示している", () => {
    const missing = Object.keys(client.SUBJECT_CATALOG).filter(
      (id) => !client.SUBJECT_CATALOG[id].sourceType
    );
    expect(missing).toEqual([]);
  });

  test("sourceType は決められた値のどれか", () => {
    const allowed = client.SOURCE_TYPES;
    expect(allowed.length).toBeGreaterThan(1);
    const bad = Object.keys(client.SUBJECT_CATALOG).filter(
      (id) => allowed.indexOf(client.SUBJECT_CATALOG[id].sourceType) < 0
    );
    expect(bad).toEqual([]);
  });

  test("正と写しで sourceType が一致する", () => {
    for (const id of Object.keys(client.SUBJECT_CATALOG)) {
      expect({ id, t: (server.SUBJECT_CATALOG[id] || {}).sourceType }).toEqual({
        id,
        t: client.SUBJECT_CATALOG[id].sourceType,
      });
    }
  });

  // 公開過去問の科目が実際に足されたとき、この検査が意味を持つ。
  // いまは0件なので空回りするが、足した人に縛りを足させない形にしてある
  // (「0件であること」を見張ると、正しい追加がこのテストで落ちる)。
  test("公開過去問の科目は、台帳の上でも無料になっている", () => {
    const rows = Object.keys(client.SUBJECT_CATALOG)
      .filter((id) => client.isPublicPastExam(id))
      .map((id) => [id, client.getSubjectPriceYen(id), client.isSubjectFree(id)]);
    for (const row of rows) {
      expect(row).toEqual([row[0], 0, true]);
    }
  });
});

describe("自作の科目は問題数の段で決まる (回帰)", () => {
  test("金額は priceForQuestionCount と同じ", () => {
    for (const id of Object.keys(client.SUBJECT_CATALOG)) {
      if (client.isPublicPastExam(id)) continue;
      expect({ id, yen: client.getSubjectPriceYen(id) }).toEqual({
        id,
        yen: client.priceForQuestionCount(
          client.SUBJECT_CATALOG[id].questionCount
        ),
      });
    }
  });
});

describe("公開過去問は問題数に関わらず無料 (3経路)", () => {
  beforeEach(() => {
    client.SUBJECT_CATALOG[FAKE_ID] = {
      title: "探り用",
      questionCount: FAKE_COUNT,
      sourceType: client.SOURCE_PUBLIC_PAST_EXAM,
    };
    server.SUBJECT_CATALOG[FAKE_ID] = client.SUBJECT_CATALOG[FAKE_ID];
  });
  afterEach(() => {
    delete client.SUBJECT_CATALOG[FAKE_ID];
    delete server.SUBJECT_CATALOG[FAKE_ID];
  });

  test("同じ問題数の自作なら上限額が付く (対照)", () => {
    expect(client.priceForQuestionCount(FAKE_COUNT)).toBe(client.PRICE_MAX);
    expect(client.PRICE_MAX).toBeGreaterThan(0);
  });

  test("正本: 0円で、無料と答える", () => {
    expect(client.getSubjectPriceYen(FAKE_ID)).toBe(0);
    expect(client.isSubjectFree(FAKE_ID)).toBe(true);
    expect(client.priceForSubject(FAKE_ID, FAKE_COUNT)).toBe(0);
  });

  test("画面: catalog の実件数が上限を超えていても0円", () => {
    const ent = loadEntitlement({ [FAKE_ID]: FAKE_COUNT });
    expect(ent.getSubjectPriceYen(FAKE_ID)).toBe(0);
    expect(ent.hasAccess(FAKE_ID)).toBe(true);
    expect(ent.remainingFree(FAKE_ID)).toBe(Infinity);
  });

  test("請求: live の件数が上限を超えていても0円", async () => {
    expect(await serverYen(FAKE_ID, FAKE_COUNT, client)).toBe(0);
  });

  test("決済の行は作られない (0円の単品は売らない)", async () => {
    expect(client.getPlanLineItem("subject", FAKE_ID)).toBe(null);
    const realFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      text: async () => "questionCount: " + FAKE_COUNT,
    });
    try {
      jest.resetModules();
      const fresh = require("../subject-catalog");
      expect(
        await fresh.getPlanLineItemLive("subject", FAKE_ID, client)
      ).toBe(null);
    } finally {
      global.fetch = realFetch;
    }
  });

  test("パックの行は影響を受けない", () => {
    const pack = client.getPlanLineItem("pack", "");
    expect(pack.amountYen).toBe(client.PACK_PRICE_YEN);
  });
});
