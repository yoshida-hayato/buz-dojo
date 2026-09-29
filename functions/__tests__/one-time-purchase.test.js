// 買い切り(mode=payment)の付与テスト。ここがバグると課金事故に直結する。
// firebase-admin はインメモリのフェイクに差し替える。

jest.mock("firebase-admin", () => {
  const makeDocRef = (uid) => ({
    get: async () => ({
      exists: Object.prototype.hasOwnProperty.call(global.__otpStore, uid),
      data: () => global.__otpStore[uid],
    }),
    set: async (data, opts) => {
      const prev = global.__otpStore[uid] || {};
      global.__otpStore[uid] = opts && opts.merge ? { ...prev, ...data } : { ...data };
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
  return { apps: [], initializeApp: jest.fn(), firestore: firestoreFn };
});

let store;
beforeEach(() => {
  global.__otpStore = {};
  store = global.__otpStore;
  jest.resetModules();
});

const load = () => require("../entitlements.js");

// js/entitlement.js の isSubjectActive の再現。画面とズレたら落ちる。
function clientSeesActive(e, subjectId) {
  if (!e) return false;
  if (e.pack === true) return true;
  const sub = e.subjects && e.subjects[subjectId];
  if (!sub) return false;
  if (sub === true) return true;
  const status = sub.status || "";
  return status === "active" || status === "trialing";
}

const session = (o) =>
  Object.assign(
    {
      id: "cs_test",
      payment_status: "paid",
      customer: "cus_test",
      payment_intent: "pi_test",
      amount_total: 1980,
    },
    o
  );

describe("applyOneTimePurchase — 付与する場合", () => {
  test("支払い済みの単品は付与され、画面側の判定を通る", async () => {
    const { applyOneTimePurchase } = load();
    const res = await applyOneTimePurchase(
      "uid-1",
      session({ metadata: { planType: "subject", subjectId: "sap" } })
    );
    expect(res.ok).toBe(true);
    expect(store["uid-1"].subjects.sap.purchaseType).toBe("one_time");
    expect(store["uid-1"].subjects.sap.paymentIntentId).toBe("pi_test");
    expect(store["uid-1"].pack).toBe(false);
    expect(clientSeesActive(store["uid-1"], "sap")).toBe(true);
    expect(clientSeesActive(store["uid-1"], "biz-career")).toBe(false);
  });

  test("パックは pack=true にし、既存の単品購入記録を消さない", async () => {
    const { applyOneTimePurchase } = load();
    store["uid-3"] = { pack: false, subjects: { sap: { status: "active" } } };
    const res = await applyOneTimePurchase(
      "uid-3",
      session({ amount_total: 3980, metadata: { planType: "pack", subjectId: "" } })
    );
    expect(res.ok).toBe(true);
    expect(store["uid-3"].pack).toBe(true);
    expect(store["uid-3"].subjects.sap).toBeDefined();
    expect(store["uid-3"].packPurchase.amountYen).toBe(3980);
  });

  test("パックは今後追加する科目にも効く(社長方針)", async () => {
    const { applyOneTimePurchase } = load();
    await applyOneTimePurchase(
      "uid-4",
      session({ amount_total: 3980, metadata: { planType: "pack", subjectId: "" } })
    );
    expect(clientSeesActive(store["uid-4"], "new-subject")).toBe(true);
  });

  test("complimentary は買い切りの書き込みで落ちない", async () => {
    const { applyOneTimePurchase } = load();
    store["uid-7"] = { pack: true, complimentary: true, complimentaryReason: "admin", subjects: {} };
    await applyOneTimePurchase(
      "uid-7",
      session({ metadata: { planType: "subject", subjectId: "sap" } })
    );
    expect(store["uid-7"].complimentary).toBe(true);
    expect(store["uid-7"].complimentaryReason).toBe("admin");
    expect(store["uid-7"].pack).toBe(true);
  });
});

describe("applyOneTimePurchase — 付与してはいけない場合", () => {
  test("payment_status が paid 以外なら付与しない", async () => {
    const { applyOneTimePurchase } = load();
    const res = await applyOneTimePurchase(
      "uid-5",
      session({ payment_status: "unpaid", metadata: { planType: "pack" } })
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_paid");
    expect(store["uid-5"]).toBeUndefined();
  });

  test("planType が不正、または uid が空なら付与しない", async () => {
    const { applyOneTimePurchase } = load();
    const bad = await applyOneTimePurchase("uid-6", session({ metadata: { planType: "bogus" } }));
    expect(bad.ok).toBe(false);
    expect(store["uid-6"]).toBeUndefined();
    const noUid = await applyOneTimePurchase("", session({ metadata: { planType: "pack" } }));
    expect(noUid.ok).toBe(false);
  });
});
