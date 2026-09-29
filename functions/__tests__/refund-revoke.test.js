// 買い切りの返金・チャージバックで付与が取り消されるかのテスト。
// ここが抜けていると、返金した相手が永久にアクセスできる。
// firebase-admin はインメモリのフェイクに差し替える。

jest.mock("firebase-admin", () => {
  const makeDocRef = (uid) => ({
    get: async () => ({
      exists: Object.prototype.hasOwnProperty.call(global.__rfStore, uid),
      data: () => global.__rfStore[uid],
    }),
    set: async (data, opts) => {
      const prev = global.__rfStore[uid] || {};
      const merged = opts && opts.merge ? { ...prev, ...data } : { ...data };
      for (const k of Object.keys(merged)) {
        if (merged[k] === "FIELD_DELETE") delete merged[k];
      }
      global.__rfStore[uid] = merged;
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
  global.__rfStore = {};
  store = global.__rfStore;
  jest.resetModules();
});

const load = () => require("../entitlements.js");

const session = (over) => ({
  id: "cs_1",
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_1",
  customer: "cus_1",
  amount_total: 430,
  metadata: { firebaseUid: "u1", planType: "subject", subjectId: "excel" },
  ...over,
});

test("単品の全額返金でその科目だけが消える", async () => {
  const e = load();
  await e.applyOneTimePurchase("u1", session());
  await e.applyOneTimePurchase(
    "u1",
    session({ id: "cs_2", payment_intent: "pi_2", metadata: { firebaseUid: "u1", planType: "subject", subjectId: "outlook" } })
  );
  expect(Object.keys(store.u1.subjects).sort()).toEqual(["excel", "outlook"]);

  const r = await e.revokeOneTimePurchase("u1", { paymentIntentId: "pi_1" });
  expect(r.ok).toBe(true);
  expect(r.removed).toEqual(["excel"]);
  expect(Object.keys(store.u1.subjects)).toEqual(["outlook"]);
});

test("パックの返金で pack が false になり packPurchase が消える", async () => {
  const e = load();
  await e.applyOneTimePurchase(
    "u1",
    session({ metadata: { firebaseUid: "u1", planType: "pack", subjectId: "" }, amount_total: 3980 })
  );
  expect(store.u1.pack).toBe(true);

  const r = await e.revokeOneTimePurchase("u1", { paymentIntentId: "pi_1" });
  expect(r.ok).toBe(true);
  expect(store.u1.pack).toBe(false);
  expect(store.u1.packPurchase).toBeUndefined();
});

test("返金後に買い直した分は巻き込まない", async () => {
  const e = load();
  await e.applyOneTimePurchase("u1", session());
  await e.revokeOneTimePurchase("u1", { paymentIntentId: "pi_1" });
  // 買い直し
  await e.applyOneTimePurchase("u1", session({ id: "cs_3", payment_intent: "pi_3" }));
  expect(store.u1.subjects.excel).toBeTruthy();

  // 古い支払いの返金イベントが後から届いても、新しい付与は残る
  const again = await e.revokeOneTimePurchase("u1", { paymentIntentId: "pi_1" });
  expect(again.ok).toBe(false);
  expect(store.u1.subjects.excel).toBeTruthy();
});

test("checkoutSessionId だけでも取り消せる", async () => {
  const e = load();
  await e.applyOneTimePurchase("u1", session({ payment_intent: null }));
  const r = await e.revokeOneTimePurchase("u1", { checkoutSessionId: "cs_1" });
  expect(r.ok).toBe(true);
  expect(store.u1.subjects.excel).toBeUndefined();
});

test("サブスクの付与は買い切りの返金では消えない", async () => {
  const e = load();
  store.u1 = {
    pack: false,
    subjects: { excel: { status: "active", subscriptionId: "sub_1" } },
  };
  const r = await e.revokeOneTimePurchase("u1", { paymentIntentId: "pi_1" });
  expect(r.ok).toBe(false);
  expect(store.u1.subjects.excel).toBeTruthy();
});

test("無料付与(complimentary)のパックは返金でも維持される", async () => {
  const e = load();
  store.u1 = { pack: true, complimentary: true, complimentaryReason: "admin", subjects: {} };
  await e.applyOneTimePurchase(
    "u1",
    session({ metadata: { firebaseUid: "u1", planType: "pack", subjectId: "" } })
  );
  const r = await e.revokeOneTimePurchase("u1", { paymentIntentId: "pi_1" });
  expect(r.ok).toBe(true);
  expect(store.u1.pack).toBe(true);
  expect(store.u1.complimentary).toBe(true);
});

test("引数が足りなければ何もしない", async () => {
  const e = load();
  store.u1 = { pack: true, subjects: {} };
  expect((await e.revokeOneTimePurchase("", { paymentIntentId: "pi_1" })).ok).toBe(false);
  expect((await e.revokeOneTimePurchase("u1", {})).ok).toBe(false);
  expect((await e.revokeOneTimePurchase("u1", null)).ok).toBe(false);
  expect(store.u1.pack).toBe(true);
});
