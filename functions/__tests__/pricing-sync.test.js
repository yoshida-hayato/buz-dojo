/**
 * config/pricing.js（表示価格の正）と functions/pricing-shared.js（決済が読む写し）の
 * ズレを検出する。2026-09-24 に biz-pm-planning で実際に起きた(表示430円 / 決済340円)。
 */
const path = require("path");
const client = require(path.join(__dirname, "..", "..", "config", "pricing.js"));
const server = require("../pricing-shared.js");

describe("料金の正と写し", () => {
  test("科目の顔ぶれが一致する", () => {
    expect(Object.keys(server.SUBJECT_CATALOG).sort()).toEqual(Object.keys(client.SUBJECT_CATALOG).sort());
  });
  test("問題数と単品価格が一致する", () => {
    for (const id of Object.keys(client.SUBJECT_CATALOG)) {
      const s = server.SUBJECT_CATALOG[id] || {};
      expect({ id, count: s.questionCount, yen: server.getSubjectPriceYen(id) }).toEqual({
        id, count: client.SUBJECT_CATALOG[id].questionCount, yen: client.getSubjectPriceYen(id) });
    }
  });
  test("パック料金と無料しきい値が一致する", () => {
    expect(server.PACK_PRICE_YEN).toBe(client.PACK_PRICE_YEN);
    expect(server.FREE_SUBJECT_MAX_COUNT).toBe(client.FREE_SUBJECT_MAX_COUNT);
    expect(server.PRICE_CAP_COUNT).toBe(client.PRICE_CAP_COUNT);
    expect(server.FREE_DAILY).toBe(client.FREE_DAILY);
  });
});
