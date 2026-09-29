/**
 * Stripe の API バージョン差で期末(current_period_end)を取りこぼさないことの検証。
 *
 * 2025-03-31.basil 以降、current_period_end は Subscription のトップレベルから
 * subscription item へ移った。Webhook の本文はエンドポイント作成時に決まった
 * バージョン(サンドボックスは 2026-08-26.dahlia)で描画され、stripe-node v17 の
 * retrieve は 2025-02-24.acacia で返る。つまり同じコードに両方の形が届く。
 * 片方しか読まないと例外にはならず、黙って null が保存される。
 */

jest.mock("firebase-admin", () => {
  const store = {};
  const makeDocRef = (uid) => ({
    get: async () => ({
      exists: Object.prototype.hasOwnProperty.call(store, uid),
      data: () => store[uid],
    }),
    set: async (data, opts) => {
      const prev = store[uid] || {};
      store[uid] = opts && opts.merge ? { ...prev, ...data } : { ...data };
    },
  });
  const firestoreFn = () => ({
    collection: () => ({
      doc: (uid) => ({ collection: () => ({ doc: () => makeDocRef(uid) }) }),
    }),
  });
  firestoreFn.FieldValue = {
    serverTimestamp: () => "SERVER_TIMESTAMP",
    delete: () => "FIELD_DELETE",
  };
  return { apps: [], initializeApp: jest.fn(), firestore: firestoreFn, __store: store };
});

const admin = require("firebase-admin");
const { applySubscription } = require("../entitlements");

const PERIOD_END = 1792592000;

function baseSubscription(uid) {
  return {
    id: "sub_x",
    status: "active",
    customer: "cus_x",
    cancel_at_period_end: false,
    metadata: { firebaseUid: uid, planType: "pack" },
  };
}

describe("applySubscription は API バージョンが違っても期末を落とさない", () => {
  test("dahlia 形式(items.data の中)から期末を読む", async () => {
    const sub = {
      ...baseSubscription("uid-dahlia"),
      items: { data: [{ id: "si_1", current_period_end: PERIOD_END }] },
    };
    await applySubscription("uid-dahlia", sub);
    expect(admin.__store["uid-dahlia"].packSubscription.currentPeriodEnd).toBe(PERIOD_END);
    expect(admin.__store["uid-dahlia"].pack).toBe(true);
  });

  test("acacia 形式(トップレベル)からも期末を読む", async () => {
    const sub = {
      ...baseSubscription("uid-acacia"),
      current_period_end: PERIOD_END,
      items: { data: [{ id: "si_1" }] },
    };
    await applySubscription("uid-acacia", sub);
    expect(admin.__store["uid-acacia"].packSubscription.currentPeriodEnd).toBe(PERIOD_END);
  });

  test("item が複数あるときは最も遅い期末を採る", async () => {
    const sub = {
      ...baseSubscription("uid-multi"),
      items: {
        data: [
          { id: "si_1", current_period_end: 100 },
          { id: "si_2", current_period_end: 300 },
          { id: "si_3", current_period_end: 200 },
        ],
      },
    };
    await applySubscription("uid-multi", sub);
    expect(admin.__store["uid-multi"].packSubscription.currentPeriodEnd).toBe(300);
  });

  test("期末がどこにも無くても例外にせず、付与そのものは通る", async () => {
    const sub = { ...baseSubscription("uid-none"), items: { data: [{ id: "si_1" }] } };
    await applySubscription("uid-none", sub);
    expect(admin.__store["uid-none"].pack).toBe(true);
    expect(admin.__store["uid-none"].packSubscription.currentPeriodEnd).toBe(null);
  });

  test("items キー自体が無くても落ちない", async () => {
    const sub = baseSubscription("uid-noitems");
    await applySubscription("uid-noitems", sub);
    expect(admin.__store["uid-noitems"].packSubscription.currentPeriodEnd).toBe(null);
  });

  test("単品(subject)でも dahlia 形式の期末を読む", async () => {
    const sub = {
      ...baseSubscription("uid-subject"),
      metadata: { firebaseUid: "uid-subject", planType: "subject", subjectId: "sap-basic" },
      items: { data: [{ id: "si_1", current_period_end: PERIOD_END }] },
    };
    await applySubscription("uid-subject", sub);
    expect(admin.__store["uid-subject"].subjects["sap-basic"].currentPeriodEnd).toBe(PERIOD_END);
  });
});
