//
// 署名検証の台帳 (functions/webhook-health.js) の振る舞いのテスト。
//
// この台帳は、売上0件の理由が「whsec の取り違え」かどうかを、社長に
// 聞かずに読めるようにするために在る。だから壊れ方は2通りある。
//
//   1. 数が増えない / 読めない → 画面が嘘をつく
//   2. 書き込みが投げる → webhook ごと落ちて、入金が反映されない
//
// 2 のほうが重い。付与より前に走る位置なので、ここで投げたら実害が出る。
// だから「書けなくても投げない」を明示的に測る。
//
let calls;

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => ({ kind: "stamp" }),
      increment: (n) => ({ kind: "incr", by: n }),
    },
  },
}));

const health = require("../webhook-health");

function fakeDb(opts) {
  const o = opts || {};
  calls = { set: [], get: 0 };
  return {
    collection: (c) => ({
      doc: (d) => ({
        set: async (data, options) => {
          calls.set.push({ c, d, data, options });
          if (o.setThrows) throw new Error("boom");
          return true;
        },
        get: async () => {
          calls.get = calls.get + 1;
          if (o.getThrows) throw new Error("boom");
          return { exists: !!o.exists, data: () => o.data || {} };
        },
      }),
    }),
  };
}

describe("失敗の種類分け", () => {
  test("署名が合わない", () => {
    expect(health.classifyFailure("No signatures found matching the expected signature for payload")).toBe("signature_mismatch");
  });

  test("時刻がずれている", () => {
    expect(health.classifyFailure("Timestamp outside the tolerance zone")).toBe("timestamp_outside_tolerance");
  });

  test("ヘッダが無い (Stripe 以外からの呼び出し)", () => {
    expect(health.classifyFailure("No stripe-signature header value was provided")).toBe("header_missing");
    expect(health.classifyFailure("Unable to extract timestamp and signatures from header")).toBe("header_missing");
  });

  test("知らない形は other", () => {
    expect(health.classifyFailure("something else")).toBe("other");
    expect(health.classifyFailure(null)).toBe("other");
    expect(health.classifyFailure(undefined)).toBe("other");
  });
});

describe("書き込み", () => {
  test("成功は成功だけを足す (失敗の欄に触らない)", async () => {
    const db = fakeDb({});
    const ok = await health.recordVerifyResult(db, true, "");
    expect(ok).toBe(true);
    expect(calls.set.length).toBe(1);
    const row = calls.set[0];
    expect([row.c, row.d]).toEqual([health.COLLECTION, health.DOC_ID]);
    expect(row.options).toEqual({ merge: true });
    expect(Object.keys(row.data).sort()).toEqual(["lastOkAt", "okCount"]);
    expect(row.data.okCount).toEqual({ kind: "incr", by: 1 });
  });

  test("失敗は数と時刻と種類と字面を足す", async () => {
    const db = fakeDb({});
    await health.recordVerifyResult(db, false, "No signatures found matching the expected signature for payload");
    const row = calls.set[0];
    expect(Object.keys(row.data).sort()).toEqual(["failCount", "lastFailAt", "lastFailKind", "lastFailMessage"]);
    expect(row.data.lastFailKind).toBe("signature_mismatch");
    expect(row.data.failCount).toEqual({ kind: "incr", by: 1 });
  });

  test("長い字面は120字で切る (台帳を太らせない)", async () => {
    const db = fakeDb({});
    const long = new Array(400).join("x");
    await health.recordVerifyResult(db, false, long);
    expect(calls.set[0].data.lastFailMessage.length).toBe(120);
  });

  test("書けなくても投げない (webhook を落とさない)", async () => {
    const db = fakeDb({ setThrows: true });
    const ok = await health.recordVerifyResult(db, true, "");
    expect(ok).toBe(false);
  });
});

describe("読み出し", () => {
  test("まだ1件も無いときは、0件と記録なしを分けて返す", async () => {
    const got = await health.readVerifyHealth(fakeDb({ exists: false }));
    expect(got.recorded).toBe(false);
    expect([got.okCount, got.failCount]).toEqual([0, 0]);
    expect([got.lastOkAt, got.lastFailAt]).toEqual([null, null]);
  });

  test("在れば数と時刻を返す (時刻は ISO の字面にする)", async () => {
    const when = { toDate: () => new Date(Date.UTC(2026, 9, 25, 4, 48, 0)) };
    const got = await health.readVerifyHealth(
      fakeDb({ exists: true, data: { okCount: 3, failCount: 2, lastOkAt: when, lastFailKind: "signature_mismatch" } })
    );
    expect([got.okCount, got.failCount]).toEqual([3, 2]);
    expect(got.lastOkAt).toBe("2026-10-25T04:48:00.000Z");
    expect(got.lastFailKind).toBe("signature_mismatch");
  });

  test("読めなければ null (0件と混ぜない)", async () => {
    expect(await health.readVerifyHealth(fakeDb({ getThrows: true }))).toBe(null);
  });
});
