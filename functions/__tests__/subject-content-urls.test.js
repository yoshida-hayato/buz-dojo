//
// 単品の値段の出どころを、全科目ぶん揃えておくためのガード。
//
// 請求額は functions/subject-catalog.js が科目ごとの catalog.js (学習道場・
// SAP道場がマスタ) に問い合わせた問題数から決まる。URL 表に載っていない科目は
// config/pricing.js の静的な questionCount に落ちる。
// 一方で画面側 (js/entitlement.js の getSubjectPriceYen) は、開いている科目の
// 実データ件数から値段を出す。だから表から漏れた科目は、master の件数が動いた
// 日に「ボタンに出る値段」と「Stripe の請求額」がずれる経路になる。
//
// 2026-10-04 時点で biz-pm-planning と biz-pm-operation が漏れていた。
// 静的な値 (694 / 295) が master と一致していたため金額の差はまだ出ていなかったが、
// 一致はたまたまで、master 側は 10-01 に更新されている。
//
// このテストは fetch を差し替えて、全科目が master に問い合わせることを見る。
// 表から漏れている科目は静的な questionCount がそのまま返るので落ちる。
//
// 2026-11-01 18:48便 に1本足した約束: 問題データをこちら側に持つ科目
// (config/extra-subjects.js に宣言した科目) は master を持たないので、
// 問い合わせずに静的な questionCount に落ちるのが正しい。
// その科目だけを除ける。除け方を「extra-subjects に宣言が在るか」に
// したので、よそに master が在る科目を表から外しても除かれない
// (外した科目は下の「master に問い合わせる」で落ちる)。
const pricing = require("../../config/pricing.js");
const { fetchCatalogCount } = require("../subject-catalog");
const rows = require("../test-helpers/subject-rows");
const extras = require("../../config/extra-subjects.js");

const SELF_HOSTED = extras.ids();
const SUBJECT_IDS = Object.keys(pricing.SUBJECT_CATALOG);
// 科目を足している途中は、料金の表に先に行が入って2枚のレジストリに未だ
// 居ない瞬間が在る。その科目はまだ何も主張できないので外す。
// 窓が閉まれば0件に戻るので、見張りの歯は残る。
const UNWIRED = rows.WIRING_IN_PROGRESS
  ? SUBJECT_IDS.filter((id) => rows.allSubjectIds().indexOf(id) < 0)
  : [];
const MASTER_IDS = SUBJECT_IDS.filter(
  (id) => SELF_HOSTED.indexOf(id) < 0 && UNWIRED.indexOf(id) < 0
);

// どの科目の静的 questionCount とも一致しない値。
const LIVE_COUNT = 777;

describe("全科目の問題数が master の catalog から取れること", () => {
  let asked;
  let realFetch;

  beforeEach(() => {
    asked = [];
    realFetch = global.fetch;
    global.fetch = async (url) => {
      asked.push(String(url));
      return { ok: true, text: async () => "questionCount: " + LIVE_COUNT };
    };
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  test("静的カタログの科目は、2枚のレジストリと同じ本数", () => {
    expect(rows.countNote(SUBJECT_IDS.length)).toBe("");
  });

  test("自前の問題データの科目は、レジストリの2枚目に宣言が在る", () => {
    // 除ける側の根拠がここ。2枚目に無い id をこの一覧に足しても除かれない。
    SELF_HOSTED.forEach((id) => {
      expect(SUBJECT_IDS.indexOf(id) >= 0).toBe(true);
    });
    expect(MASTER_IDS.length).toBe(
      SUBJECT_IDS.length - SELF_HOSTED.length - UNWIRED.length
    );
  });

  test("LIVE_COUNT はどの静的 questionCount とも重なっていない", () => {
    const hit = SUBJECT_IDS.filter((id) => {
      return Number(pricing.SUBJECT_CATALOG[id].questionCount) === LIVE_COUNT;
    });
    expect(hit.length).toBe(0);
  });

  MASTER_IDS.forEach((id) => {
    test(id + " は master に問い合わせる", async () => {
      const n = await fetchCatalogCount(id, pricing);
      // URL 表から漏れていると、静的な questionCount がそのまま返る。
      expect(n).toBe(LIVE_COUNT);
      expect(asked.length).toBe(1);
      // 問い合わせ先に科目 id が入っていること (別科目の表を引いていない)。
      expect(asked[0].indexOf(id) >= 0).toBe(true);
      expect(asked[0].indexOf("catalog") >= 0).toBe(true);
    });
  });

  SELF_HOSTED.forEach((id) => {
    test(id + " は自前の問題データなので、master に問い合わせない", async () => {
      const n = await fetchCatalogCount(id, pricing);
      expect(asked.length).toBe(0);
      expect(n).toBe(Number(pricing.SUBJECT_CATALOG[id].questionCount));
    });
  });

  test("表に無い科目は静的な値に落ちる (この落ち方そのものは残す)", async () => {
    const n = await fetchCatalogCount("sonzai-shinai-kamoku", pricing);
    expect(n).toBe(0);
    expect(asked.length).toBe(0);
  });
});
