/**
 * entitlements.js のロジックテスト。
 *
 * firebase-admin は実際のFirestoreに繋がずインメモリのフェイクに差し替える。
 * ここでバグると「無料ユーザーが有料コンテンツを見られる」「課金したのに
 * 反映されない」といった実害に直結するため、Stripeサブスクの状態遷移を
 * 中心に検証する。
 */

let store;

jest.mock("firebase-admin", () => {
  const makeDocRef = (uid) => ({
    get: async () => ({
      exists: Object.prototype.hasOwnProperty.call(global.__entitlementsStore, uid),
      data: () => global.__entitlementsStore[uid],
    }),
    set: async (data, opts) => {
      const prev = global.__entitlementsStore[uid] || {};
      global.__entitlementsStore[uid] = opts && opts.merge ? { ...prev, ...data } : { ...data };
    },
  });

  const firestoreFn = () => ({
    collection: () => ({
      doc: (uid) => ({
        collection: () => ({
          doc: () => makeDocRef(uid),
        }),
      }),
    }),
  });
  firestoreFn.FieldValue = {
    serverTimestamp: () => "SERVER_TIMESTAMP",
    delete: () => "FIELD_DELETE",
  };

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: firestoreFn,
  };
});

beforeEach(() => {
  global.__entitlementsStore = {};
  store = global.__entitlementsStore;
  jest.resetModules();
});

function load() {
  // jest.resetModules()後に再requireして、モックとテスト間の状態を独立させる
  return require("../entitlements.js");
}

describe("ensureComplimentaryPack", () => {
  test("許可リストのメールなら無償でpackを付与する", async () => {
    const { ensureComplimentaryPack, COMPLIMENTARY_PACK_EMAILS } = load();
    const email = COMPLIMENTARY_PACK_EMAILS[0];
    const res = await ensureComplimentaryPack("uid-admin", email);
    expect(res.ok).toBe(true);
    expect(store["uid-admin"].pack).toBe(true);
    expect(store["uid-admin"].complimentary).toBe(true);
  });

  test("許可リストにないメールは付与しない", async () => {
    const { ensureComplimentaryPack } = load();
    const res = await ensureComplimentaryPack("uid-other", "someone@example.com");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_eligible");
    expect(store["uid-other"]).toBeUndefined();
  });

  test("大文字・前後空白のメールも一致させる", async () => {
    const { ensureComplimentaryPack, COMPLIMENTARY_PACK_EMAILS } = load();
    const messy = `  ${COMPLIMENTARY_PACK_EMAILS[0].toUpperCase()}  `;
    const res = await ensureComplimentaryPack("uid-admin2", messy);
    expect(res.ok).toBe(true);
    expect(store["uid-admin2"].pack).toBe(true);
  });

  test("既に付与済みなら再度書き込まず already:true を返す", async () => {
    const { ensureComplimentaryPack, COMPLIMENTARY_PACK_EMAILS } = load();
    const email = COMPLIMENTARY_PACK_EMAILS[0];
    await ensureComplimentaryPack("uid-admin3", email);
    const res2 = await ensureComplimentaryPack("uid-admin3", email);
    expect(res2.already).toBe(true);
  });
});

describe("applySubscription — pack", () => {
  test("有効なpackサブスクはpack=trueにし、単品科目をクリアする", async () => {
    const { applySubscription } = load();
    store["uid-1"] = { pack: false, subjects: { sap: { status: "active" } } };
    await applySubscription("uid-1", {
      id: "sub_1",
      status: "active",
      metadata: { planType: "pack" },
    });
    expect(store["uid-1"].pack).toBe(true);
    expect(store["uid-1"].subjects).toEqual({});
  });

  test("無効化されたpackサブスク(非complimentary)はpack=falseに戻す", async () => {
    const { applySubscription } = load();
    store["uid-2"] = { pack: true, subjects: {} };
    await applySubscription("uid-2", {
      id: "sub_2",
      status: "canceled",
      metadata: { planType: "pack" },
    });
    expect(store["uid-2"].pack).toBe(false);
  });

  test("complimentaryユーザーはStripe解約でもpackが落ちない", async () => {
    const { applySubscription } = load();
    store["uid-3"] = { pack: true, complimentary: true, subjects: {} };
    await applySubscription("uid-3", {
      id: "sub_3",
      status: "canceled",
      metadata: { planType: "pack" },
    });
    expect(store["uid-3"].pack).toBe(true);
  });
});

describe("applySubscription — subject", () => {
  test("有効な単品サブスクはsubjectsに追加される", async () => {
    const { applySubscription } = load();
    store["uid-4"] = { pack: false, subjects: {} };
    await applySubscription("uid-4", {
      id: "sub_4",
      status: "active",
      metadata: { planType: "subject", subjectId: "sap" },
    });
    expect(store["uid-4"].subjects.sap).toBeDefined();
    expect(store["uid-4"].subjects.sap.status).toBe("active");
  });

  test("既にpackを持つユーザーは単品サブスクが来てもsubjectsに追加しない(二重課金防止)", async () => {
    const { applySubscription } = load();
    store["uid-5"] = { pack: true, subjects: {} };
    await applySubscription("uid-5", {
      id: "sub_5",
      status: "active",
      metadata: { planType: "subject", subjectId: "sap" },
    });
    expect(store["uid-5"].subjects.sap).toBeUndefined();
  });

  test("無効化された単品サブスクはsubjectsから削除される", async () => {
    const { applySubscription } = load();
    store["uid-6"] = { pack: false, subjects: { sap: { status: "active" } } };
    await applySubscription("uid-6", {
      id: "sub_6",
      status: "canceled",
      metadata: { planType: "subject", subjectId: "sap" },
    });
    expect(store["uid-6"].subjects.sap).toBeUndefined();
  });
});

describe("revokeSubscription", () => {
  test("pack解約(非complimentary)はpack=falseにする", async () => {
    const { revokeSubscription } = load();
    store["uid-7"] = { pack: true, subjects: {} };
    await revokeSubscription("uid-7", { metadata: { planType: "pack" } });
    expect(store["uid-7"].pack).toBe(false);
  });

  test("pack解約でもcomplimentaryなら剥奪しない", async () => {
    const { revokeSubscription } = load();
    store["uid-8"] = { pack: true, complimentary: true, subjects: {} };
    await revokeSubscription("uid-8", { metadata: { planType: "pack" } });
    expect(store["uid-8"].pack).toBe(true);
  });

  test("単品科目の解約はその科目だけをsubjectsから外す", async () => {
    const { revokeSubscription } = load();
    store["uid-9"] = {
      pack: false,
      subjects: { sap: { status: "active" }, "biz-career": { status: "active" } },
    };
    await revokeSubscription("uid-9", {
      metadata: { planType: "subject", subjectId: "sap" },
    });
    expect(store["uid-9"].subjects.sap).toBeUndefined();
    expect(store["uid-9"].subjects["biz-career"]).toBeDefined();
  });
});
