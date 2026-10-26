// 公開過去問の科目を足すときの門。
//
// なぜ要るか (2026-10-26):
//   社長の指示は「公開情報の過去問を足して、無料にする」「他にも色々な試験を
//   追加して」である。だが「公表された試験問題は自由に使える」は俗説で、
//   法律上の根拠が無い。著作権法が権利の目的から外しているのは法令・告示・
//   判決などで、試験問題は入っていない。使えるかどうかは実施団体が個別に
//   許諾しているかで決まり、団体ごとに逆の答えになる。
//
//   一次情報で確認した結果 (2026-10-26):
//     許諾が明示: 情報処理推進機構 / 日本FP協会 / 法務省 / 厚生労働省
//     許諾が必須: 行政書士試験研究センター
//     断っている: 日本商工会議所 (営利目的の使用を明示的に拒否) /
//                 不動産適正取引推進機構 (無断転載・無断改変を禁止)
//     記述が無い: 金融財政事情研究会 / 中小企業診断協会 / 社会保険労務士
//
//   つまり「過去問だから無料で載せていい」で一律に進めると、簿記と宅建で
//   規約違反になる。本番は課金が動いている商用サイトなので、ここは
//   見た目の問題ではない。だから機械に止めさせる。
//
// 門の形:
//   sourceType が公開過去問の科目は、examLicense に台帳の鍵を書くこと。
//   その鍵の status が granted でなければ落ちる。
const licenses = require("../../config/exam-licenses.js");
const pricing = require("../../config/pricing.js");

describe("試験の許諾台帳", () => {
  test("status は決められた4段のどれか", () => {
    const bad = Object.keys(licenses.EXAM_LICENSES).filter(
      (k) => licenses.STATUSES.indexOf(licenses.EXAM_LICENSES[k].status) < 0
    );
    expect(bad).toEqual([]);
  });

  test("どの行も団体名と試験名と根拠の註を持つ", () => {
    const bad = Object.keys(licenses.EXAM_LICENSES).filter((k) => {
      const row = licenses.EXAM_LICENSES[k];
      return !row.body || !row.examLabel || !row.note;
    });
    expect(bad).toEqual([]);
  });

  test("転載してよいのは granted だけ", () => {
    for (const key of Object.keys(licenses.EXAM_LICENSES)) {
      const row = licenses.EXAM_LICENSES[key];
      expect({ key, may: licenses.mayReproduce(key) }).toEqual({
        key,
        may: row.status === licenses.GRANTED,
      });
    }
  });

  test("知らない鍵は転載不可に倒れる", () => {
    expect(licenses.mayReproduce("__not_a_real_exam__")).toBe(false);
    expect(licenses.mayReproduce("")).toBe(false);
    expect(licenses.mayReproduce(undefined)).toBe(false);
  });

  test("断られている試験と許諾が必要な試験が、台帳に残っている", () => {
    // ここが空になるのは、台帳から消されたか status を書き替えられたとき。
    // 消すと「調べていない試験」と区別が付かなくなり、同じ調査をやり直す。
    expect(licenses.keysByStatus(licenses.DENIED).length).toBeGreaterThan(0);
    expect(
      licenses.keysByStatus(licenses.REQUIRES_PERMISSION).length
    ).toBeGreaterThan(0);
  });

  test("granted の行は、出典の明記と改変の明記を条件として持つ", () => {
    for (const key of licenses.keysByStatus(licenses.GRANTED)) {
      const row = licenses.EXAM_LICENSES[key];
      expect({ key, a: row.needsAttribution, m: row.needsModificationNotice })
        .toEqual({ key, a: true, m: true });
    }
  });
});

// 2026-10-26 に一次情報で確認した結論そのもの。status を書き替えるには
// この表も直すことになり、そのとき註を読み直す経路に入る。
// 表が無いと、status を granted に倒すだけで門が開いてしまう (緩い見張りの型)。
const CONFIRMED_2026_10_26 = {
  "ipa-joho-shori": "granted",
  "jafp-fp": "granted",
  "moj-shiho": "granted",
  "mhlw-kokushi": "granted",
  "nissho-boki": "denied",
  "gyosei-shoshi": "requires-permission",
  takken: "denied",
  "kinzai-fp": "unknown",
  shindanshi: "unknown",
  sharoshi: "unknown",
};

describe("確認した結論が書き替わっていない", () => {
  test("台帳の status が、確認した日の結論と一致する", () => {
    for (const key of Object.keys(CONFIRMED_2026_10_26)) {
      const row = licenses.get(key);
      expect({ key, status: row && row.status }).toEqual({
        key,
        status: CONFIRMED_2026_10_26[key],
      });
    }
  });

  test("転載してよい試験を増やすには、この表も直すことになる", () => {
    const unpinned = licenses
      .keysByStatus(licenses.GRANTED)
      .filter((k) => CONFIRMED_2026_10_26[k] !== "granted");
    expect(unpinned).toEqual([]);
  });
});

describe("公開過去問の科目は、許諾された試験しか名乗れない", () => {
  test("科目ごとに門を通す", () => {
    const offenders = [];
    for (const id of Object.keys(pricing.SUBJECT_CATALOG)) {
      if (!pricing.isPublicPastExam(id)) continue;
      const key = pricing.SUBJECT_CATALOG[id].examLicense;
      if (!key || !licenses.mayReproduce(key)) {
        offenders.push([id, key || "(未記入)"]);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("自作の科目は examLicense を名乗らない", () => {
    const offenders = Object.keys(pricing.SUBJECT_CATALOG).filter(
      (id) =>
        !pricing.isPublicPastExam(id) && pricing.SUBJECT_CATALOG[id].examLicense
    );
    expect(offenders).toEqual([]);
  });

  test("門は実際に止める (断られている試験で足そうとしたとき)", () => {
    const probe = "__gate_probe__";
    pricing.SUBJECT_CATALOG[probe] = {
      title: "簿記の探り",
      questionCount: 500,
      sourceType: pricing.SOURCE_PUBLIC_PAST_EXAM,
      examLicense: "nissho-boki",
    };
    try {
      const key = pricing.SUBJECT_CATALOG[probe].examLicense;
      expect(licenses.get(key).status).toBe(licenses.DENIED);
      expect(licenses.mayReproduce(key)).toBe(false);
    } finally {
      delete pricing.SUBJECT_CATALOG[probe];
    }
  });
});
