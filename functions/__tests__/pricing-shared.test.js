const Pricing = require("../pricing-shared.js");

describe("priceForQuestionCount", () => {
  test("100問以下は無料", () => {
    expect(Pricing.priceForQuestionCount(0)).toBe(0);
    expect(Pricing.priceForQuestionCount(1)).toBe(0);
    expect(Pricing.priceForQuestionCount(100)).toBe(0);
  });

  test("3000問以上は上限価格(980円)", () => {
    expect(Pricing.priceForQuestionCount(3000)).toBe(Pricing.PRICE_MAX);
    expect(Pricing.priceForQuestionCount(999999)).toBe(Pricing.PRICE_MAX);
  });

  test("101〜2999問は下限〜上限の間で按分され、10円単位に丸められる", () => {
    const price = Pricing.priceForQuestionCount(1500);
    expect(price).toBeGreaterThanOrEqual(Pricing.PRICE_MIN);
    expect(price).toBeLessThanOrEqual(Pricing.PRICE_MAX);
    expect(price % 10).toBe(0);
  });

  test("問題数が増えるほど価格は単調増加する(逆転しない)", () => {
    const counts = [101, 300, 800, 1500, 2500, 2999];
    const prices = counts.map((c) => Pricing.priceForQuestionCount(c));
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  test("不正な入力(負数・NaN・非数値)は0問扱い(無料)にフォールバックする", () => {
    expect(Pricing.priceForQuestionCount(-5)).toBe(0);
    expect(Pricing.priceForQuestionCount(NaN)).toBe(0);
    expect(Pricing.priceForQuestionCount(undefined)).toBe(0);
    expect(Pricing.priceForQuestionCount("not-a-number")).toBe(0);
  });
});

describe("SUBJECT_CATALOG の整合性", () => {
  const entries = Object.entries(Pricing.SUBJECT_CATALOG);

  test("カタログは1件以上登録されている", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test.each(entries)("%s は title(文字列) と questionCount(0以上の数値) を持つ", (id, meta) => {
    expect(typeof meta.title).toBe("string");
    expect(meta.title.length).toBeGreaterThan(0);
    expect(typeof meta.questionCount).toBe("number");
    expect(meta.questionCount).toBeGreaterThanOrEqual(0);
  });
});

describe("getSubjectPriceYen / isSubjectFree", () => {
  test("未知の科目IDはnullを返す", () => {
    expect(Pricing.getSubjectPriceYen("__not_a_real_subject__")).toBeNull();
  });

  test("登録済みの科目は priceForQuestionCount と同じ値を返す", () => {
    for (const [id, meta] of Object.entries(Pricing.SUBJECT_CATALOG)) {
      expect(Pricing.getSubjectPriceYen(id)).toBe(
        Pricing.priceForQuestionCount(meta.questionCount)
      );
    }
  });

  test("価格が0円の科目は isSubjectFree が true", () => {
    for (const id of Object.keys(Pricing.SUBJECT_CATALOG)) {
      const yen = Pricing.getSubjectPriceYen(id);
      expect(Pricing.isSubjectFree(id)).toBe(yen === 0);
    }
  });
});

describe("getPlanLineItem", () => {
  test("planType=pack は固定金額のプレミアムパック明細を返す", () => {
    const item = Pricing.getPlanLineItem("pack");
    expect(item).not.toBeNull();
    expect(item.amountYen).toBe(Pricing.PACK_PRICE_YEN);
    expect(item.metadata.planType).toBe("pack");
  });

  test("planType=subject かつ有料科目は科目の金額で明細を返す", () => {
    const paidId = Object.keys(Pricing.SUBJECT_CATALOG).find(
      (id) => !Pricing.isSubjectFree(id)
    );
    expect(paidId).toBeDefined();
    const item = Pricing.getPlanLineItem("subject", paidId);
    expect(item).not.toBeNull();
    expect(item.amountYen).toBe(Pricing.getSubjectPriceYen(paidId));
    expect(item.metadata).toEqual({ planType: "subject", subjectId: paidId });
  });

  test("planType=subject かつ無料科目はnull(課金対象にならない)", () => {
    const freeId = Object.keys(Pricing.SUBJECT_CATALOG).find((id) =>
      Pricing.isSubjectFree(id)
    );
    if (freeId) {
      expect(Pricing.getPlanLineItem("subject", freeId)).toBeNull();
    }
  });

  test("未知の科目IDはnull", () => {
    expect(Pricing.getPlanLineItem("subject", "__not_a_real_subject__")).toBeNull();
  });

  test("不正なplanTypeはnull", () => {
    expect(Pricing.getPlanLineItem("bogus", "sap")).toBeNull();
    expect(Pricing.getPlanLineItem("subject", undefined)).toBeNull();
  });
});

describe("isKnownSubject", () => {
  test("登録済みIDはtrue、未登録IDはfalse", () => {
    for (const id of Object.keys(Pricing.SUBJECT_CATALOG)) {
      expect(Pricing.isKnownSubject(id)).toBe(true);
    }
    expect(Pricing.isKnownSubject("__not_a_real_subject__")).toBe(false);
  });
});
