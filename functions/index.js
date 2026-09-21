const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Stripe = require("stripe");
const admin = require("firebase-admin");
const { getPlanLineItem, isKnownSubject } = require("./pricing");
const { getPlanLineItemLive } = require("./subject-catalog");
const {
  getEntitlements,
  setStripeCustomerId,
  applySubscription,
  revokeSubscription,
  cancelSubjectSubscriptions,
  activeSubscriptionStatuses,
  ensureComplimentaryPack,
} = require("./entitlements");
const { createImportLegacyDojoStatsExport, createImportSapDojoStatsExport } = require("./legacy-import");
const {
  createMergeLegacyQuestionStatsExport,
  createRepairQuestionStatsQuadrupleExport,
} = require("./question-stats-merge");

const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

const SITE_URL = "https://buz-dojo.web.app";
const REGION = "asia-northeast1";
const SERVICE_ACCOUNT = "firebase-adminsdk-fbsvc@buz-dojo.iam.gserviceaccount.com";

function stripeClient(secret) {
  return new Stripe(secret);
}

/** テスト→本番切替などで無効な customer が残っていても作り直す */
async function ensureStripeCustomer(stripe, uid, email, existingCustomerId) {
  if (existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(existingCustomerId);
      if (existing && !existing.deleted) return existingCustomerId;
    } catch (err) {
      if (err && err.code !== "resource_missing") throw err;
      console.warn("Stale stripeCustomerId, recreating for", uid, existingCustomerId);
    }
  }
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { firebaseUid: uid },
  });
  await setStripeCustomerId(uid, customer.id);
  return customer.id;
}

async function resolveUidFromSubscription(stripe, subscription) {
  const meta = subscription.metadata || {};
  return meta.firebaseUid || null;
}

async function syncSubscriptionAndMaybeCancelSubjects(stripe, subscription, uidHint) {
  const uid =
    subscription.metadata?.firebaseUid ||
    uidHint ||
    (await resolveUidFromSubscription(stripe, subscription));
  if (!uid) return null;

  await applySubscription(uid, subscription);

  const planType = subscription.metadata?.planType || "";
  const status = subscription.status || "";
  if (
    planType === "pack" &&
    activeSubscriptionStatuses().has(status) &&
    subscription.customer
  ) {
    const result = await cancelSubjectSubscriptions(
      stripe,
      subscription.customer,
      subscription.id
    );
    if (result.canceled && result.canceled.length) {
      console.info("Canceled subject subscriptions after pack:", uid, result.canceled);
    }
  }
  return uid;
}


/** Checkout Session 作成（単品 subject / 全パック pack） */
exports.createCheckoutSession = onCall(
  {
    region: REGION,
    secrets: [stripeSecret],
    cors: true,
    serviceAccount: SERVICE_ACCOUNT,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です");
    }

    const planType = String(request.data?.planType || "");
    const subjectId = String(request.data?.subjectId || "");
    const pricing = require("./pricing");
    const line =
      planType === "subject"
        ? await getPlanLineItemLive(planType, subjectId, pricing)
        : getPlanLineItem(planType, subjectId);
    if (!line) {
      throw new HttpsError(
        "invalid-argument",
        planType === "subject"
          ? "この問題集は無料のため購入できません（またはプランが不正です）"
          : "プランが不正です"
      );
    }
    if (!(line.amountYen > 0)) {
      throw new HttpsError("failed-precondition", "このプランは無料のため決済不要です");
    }
    if (planType === "subject" && !isKnownSubject(subjectId)) {
      throw new HttpsError("invalid-argument", "問題集が見つかりません");
    }

    try {
    const uid = request.auth.uid;
    const stripe = stripeClient(stripeSecret.value());
    const entitlements = await getEntitlements(uid);
    if (planType === "subject" && entitlements.pack === true) {
      throw new HttpsError(
        "failed-precondition",
        "プレミアムパック購読中のため、単品プランは不要です"
      );
    }
    let customerId = await ensureStripeCustomer(
      stripe,
      uid,
      request.auth.token.email,
      entitlements.stripeCustomerId || null
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // Managed Payments 有効アカウントでは tax_code 必須になるため、当面は無効化
      managed_payments: { enabled: false },
      line_items: [
        {
          price_data: {
            currency: "jpy",
            unit_amount: line.amountYen,
            recurring: { interval: "month" },
            product_data: {
              name: line.name,
              metadata: line.metadata,
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          firebaseUid: uid,
          planType: line.metadata.planType,
          subjectId: line.metadata.subjectId,
        },
      },
      client_reference_id: uid,
      metadata: {
        firebaseUid: uid,
        planType: line.metadata.planType,
        subjectId: line.metadata.subjectId,
      },
      success_url: `${SITE_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?checkout=cancel`,
      allow_promotion_codes: true,
    });

    return { url: session.url };
    } catch (err) {
      console.error("createCheckoutSession failed:", err);
      if (err instanceof HttpsError) throw err;
      const msg =
        (err && err.message) ||
        "決済画面の作成に失敗しました。しばらくしてから再度お試しください。";
      throw new HttpsError("internal", msg);
    }
  }
);

/** 管理者向け: 支払いなしでプレミアムパック相当を付与 */
exports.ensureAdminComplimentaryPack = onCall(
  {
    region: REGION,
    cors: true,
    serviceAccount: SERVICE_ACCOUNT,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です");
    }
    const email = (request.auth.token && request.auth.token.email) || "";
    const result = await ensureComplimentaryPack(request.auth.uid, email);
    if (!result.ok) {
      throw new HttpsError("permission-denied", "対象外のアカウントです");
    }
    return result;
  }
);

/** Stripe Customer Portal（解約・カード変更） */
exports.createPortalSession = onCall(
  {
    region: REGION,
    secrets: [stripeSecret],
    cors: true,
    serviceAccount: SERVICE_ACCOUNT,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です");
    }

    const uid = request.auth.uid;
    const entitlements = await getEntitlements(uid);
    if (!entitlements.stripeCustomerId) {
      throw new HttpsError("failed-precondition", "有効な契約が見つかりません");
    }

    const stripe = stripeClient(stripeSecret.value());
    let customerId;
    try {
      const existing = await stripe.customers.retrieve(entitlements.stripeCustomerId);
      if (!existing || existing.deleted) {
        throw new HttpsError(
          "failed-precondition",
          "契約情報の更新が必要です。一度購入画面からやり直すか、サポートへお問い合わせください"
        );
      }
      customerId = existing.id;
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (err && err.code === "resource_missing") {
        throw new HttpsError(
          "failed-precondition",
          "テスト環境の契約データが残っています。本番では新規に購入してください"
        );
      }
      throw err;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/?portal=return`,
    });

    return { url: session.url };
  }
);

/** Stripe Webhook */
exports.stripeWebhook = onRequest(
  {
    region: REGION,
    secrets: [stripeSecret, stripeWebhookSecret],
    cors: false,
    serviceAccount: SERVICE_ACCOUNT,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const stripe = stripeClient(stripeSecret.value());
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeWebhookSecret.value()
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const uid = session.client_reference_id || session.metadata?.firebaseUid;
          if (uid && session.customer) {
            await setStripeCustomerId(uid, session.customer);
          }
          if (session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await syncSubscriptionAndMaybeCancelSubjects(stripe, subscription, uid);
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          await syncSubscriptionAndMaybeCancelSubjects(stripe, subscription, null);
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const uid =
            subscription.metadata?.firebaseUid ||
            (await resolveUidFromSubscription(stripe, subscription));
          if (uid) await revokeSubscription(uid, subscription);
          break;
        }
        default:
          break;
      }
      res.json({ received: true });
    } catch (err) {
      console.error("Webhook handler error:", err);
      res.status(500).send("Webhook handler failed");
    }
  }
);

/** 過去アプリ（SAP道場 + 学習道場）の成績を取り込む */
exports.importLegacyDojoStats = createImportLegacyDojoStatsExport();

/** 後方互換: SAP道場のみ */
exports.importSapDojoStats = createImportSapDojoStatsExport();

/** 過去アプリのみんなの正答率（questionStats）を合算 */
exports.mergeLegacyQuestionStats = createMergeLegacyQuestionStatsExport();

/** 再合算バグで4倍になった questionStats を ÷4 で修復 */
exports.repairQuestionStatsQuadruple = createRepairQuestionStatsQuadrupleExport();

/** X 毎日 SAP クイズ（7:45 JST） */
const {
  createXDailySapQuizScheduleExport,
  createPostXDailySapQuizNowExport,
  createGetXDailySapScheduleExport,
  createSetXDailySapScheduleOverrideExport,
} = require("./x-daily-sap");
exports.xDailySapQuiz = createXDailySapQuizScheduleExport();
exports.postXDailySapQuizNow = createPostXDailySapQuizNowExport();
exports.getXDailySapSchedule = createGetXDailySapScheduleExport();
exports.setXDailySapScheduleOverride = createSetXDailySapScheduleOverrideExport();

/** X 毎日 生産管理2級クイズ（8:15 JST・SAP Secrets とは分離） */
const {
  createXDailySeisanQuizScheduleExport,
  createPostXDailySeisanQuizNowExport,
  createGetXDailySeisanScheduleExport,
  createSetXDailySeisanScheduleOverrideExport,
} = require("./x-daily-seisan");
exports.xDailySeisanQuiz = createXDailySeisanQuizScheduleExport();
exports.postXDailySeisanQuizNow = createPostXDailySeisanQuizNowExport();
exports.getXDailySeisanSchedule = createGetXDailySeisanScheduleExport();
exports.setXDailySeisanScheduleOverride = createSetXDailySeisanScheduleOverrideExport();
