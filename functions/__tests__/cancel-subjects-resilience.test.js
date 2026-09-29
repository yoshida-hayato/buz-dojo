// cancelSubjectSubscriptions が Stripe API の失敗で投げないことを守るテスト。
//
// 9/27 19:37 の customer.subscription.updated が3回 500 で失敗した経路。
// 付与(applySubscription)は保存済みなのに、そのあとの掃除で
// stripe.subscriptions.list が投げると Webhook 全体が 500 になり、
// Stripe が再送し、再送でも同じ理由で落ちて連続失敗になる。
// 掃除は付与の正しさに影響しないので、失敗しても解決済みとして返す。

jest.mock("firebase-admin", () => {
  const firestoreFn = () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }),
  });
  firestoreFn.FieldValue = { serverTimestamp: () => "TS", delete: () => "DEL" };
  return { apps: [], initializeApp: jest.fn(), firestore: firestoreFn };
});

const { cancelSubjectSubscriptions } = require("../entitlements");

describe("cancelSubjectSubscriptions は掃除の失敗を外に投げない", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    console.error.mockRestore();
  });

  test("subscriptions.list が投げても reject せず canceled を返す", async () => {
    const stripe = {
      subscriptions: {
        list: jest.fn(async () => {
          const err = new Error("Request rate limit exceeded");
          err.type = "StripeRateLimitError";
          throw err;
        }),
        cancel: jest.fn(),
      },
    };
    const result = await cancelSubjectSubscriptions(stripe, "cus_x", "sub_pack");
    expect(result).toEqual({ canceled: [] });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  test("途中の status で投げても、それまでに解約したぶんは返る", async () => {
    let call = 0;
    const stripe = {
      subscriptions: {
        list: jest.fn(async () => {
          call += 1;
          if (call === 1) {
            return {
              has_more: false,
              data: [{ id: "sub_a", metadata: { planType: "subject" } }],
            };
          }
          throw new Error("boom");
        }),
        cancel: jest.fn(async () => ({})),
      },
    };
    const result = await cancelSubjectSubscriptions(stripe, "cus_x", "sub_pack");
    expect(result.canceled).toEqual(["sub_a"]);
  });

  test("正常時はこれまでどおり単品だけ解約する", async () => {
    const stripe = {
      subscriptions: {
        list: jest.fn(async ({ status }) =>
          status === "active"
            ? {
                has_more: false,
                data: [
                  { id: "sub_pack", metadata: { planType: "pack" } },
                  { id: "sub_b", metadata: { planType: "subject" } },
                ],
              }
            : { has_more: false, data: [] }
        ),
        cancel: jest.fn(async () => ({})),
      },
    };
    const result = await cancelSubjectSubscriptions(stripe, "cus_x", "sub_pack");
    expect(result.canceled).toEqual(["sub_b"]);
  });
});
