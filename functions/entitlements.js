const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/** 支払いなしでプレミアムパック相当にする管理者メール */
const COMPLIMENTARY_PACK_EMAILS = ["yoshida.hayato0126@gmail.com"];

function entitlementsRef(uid) {
  return db.collection("users").doc(uid).collection("private").doc("entitlements");
}

async function getEntitlements(uid) {
  const snap = await entitlementsRef(uid).get();
  return snap.exists ? snap.data() : {};
}

async function saveEntitlements(uid, patch) {
  const ref = entitlementsRef(uid);
  await ref.set(
    {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function setStripeCustomerId(uid, customerId) {
  if (!customerId) return;
  await saveEntitlements(uid, { stripeCustomerId: customerId });
}

function activeSubscriptionStatuses() {
  return new Set(["active", "trialing"]);
}

/**
 * 管理者など、課金なしで pack を付与する
 */
async function ensureComplimentaryPack(uid, email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!uid || !COMPLIMENTARY_PACK_EMAILS.includes(normalized)) {
    return { ok: false, reason: "not_eligible" };
  }
  const current = await getEntitlements(uid);
  if (current.pack === true && current.complimentary === true) {
    return { ok: true, already: true, pack: true };
  }
  await saveEntitlements(uid, {
    pack: true,
    complimentary: true,
    complimentaryReason: "admin",
    complimentaryEmail: normalized,
  });
  return { ok: true, pack: true };
}

/**
 * 期末(current_period_end)を API バージョン差に関係なく読む。
 *
 * Stripe は 2025-03-31.basil 以降、current_period_end を Subscription の
 * トップレベルから subscription item へ移した。Webhook の本文は
 * エンドポイントのバージョン(2026-08-26.dahlia)で描画され、
 * stripe-node v17 の retrieve は 2025-02-24.acacia で返ってくるので、
 * 同じコードに両方の形が届く。片方しか読まないと黙って null が入る。
 * item が複数あるときは最も遅い期末を採る(いつまで使えるか、の意味に合わせる)。
 */
function readCurrentPeriodEnd(subscription) {
  if (!subscription) return null;
  if (typeof subscription.current_period_end === "number") {
    return subscription.current_period_end;
  }
  const items = (subscription.items && subscription.items.data) || [];
  let latest = null;
  for (const item of items) {
    const end = item && item.current_period_end;
    if (typeof end === "number" && (latest === null || end > latest)) latest = end;
  }
  return latest;
}

async function applySubscription(uid, subscription) {
  const meta = subscription.metadata || {};
  const planType = meta.planType || "";
  const subjectId = meta.subjectId || "";
  const status = subscription.status || "";
  const active = activeSubscriptionStatuses().has(status);
  const subPayload = {
    subscriptionId: subscription.id,
    status,
    currentPeriodEnd: readCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  };

  const current = await getEntitlements(uid);
  const complimentary = current.complimentary === true;
  const next = {
    stripeCustomerId: subscription.customer || current.stripeCustomerId || null,
    pack: Boolean(current.pack),
    subjects: { ...(current.subjects || {}) },
  };
  if (complimentary) {
    next.complimentary = true;
    if (current.complimentaryReason) next.complimentaryReason = current.complimentaryReason;
    if (current.complimentaryEmail) next.complimentaryEmail = current.complimentaryEmail;
  }

  if (planType === "pack") {
    if (active) {
      next.pack = true;
      next.packSubscription = subPayload;
      next.subjects = {};
    } else {
      // 管理者の complimentary は Stripe 解約でも落とさない
      next.pack = complimentary ? true : false;
      next.packSubscription = admin.firestore.FieldValue.delete();
    }
  } else if (planType === "subject" && subjectId) {
    if (active && !next.pack) next.subjects[subjectId] = subPayload;
    else delete next.subjects[subjectId];
  }

  await saveEntitlements(uid, next);
}

/**
 * プレミアムパック有効化時に、同一顧客の単品サブスクを即時解約する
 */
async function cancelSubjectSubscriptions(stripe, customerId, keepSubscriptionId) {
  if (!stripe || !customerId) return { canceled: [] };
  const canceled = [];
  const statuses = ["active", "trialing", "past_due"];
  for (const status of statuses) {
    let startingAfter = undefined;
    for (;;) {
      const page = await stripe.subscriptions.list({
        customer: customerId,
        status,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const sub of page.data) {
        if (keepSubscriptionId && sub.id === keepSubscriptionId) continue;
        const planType = (sub.metadata && sub.metadata.planType) || "";
        if (planType !== "subject") continue;
        try {
          await stripe.subscriptions.cancel(sub.id);
          canceled.push(sub.id);
        } catch (err) {
          console.error("cancel subject subscription failed:", sub.id, err);
        }
      }
      if (!page.has_more || !page.data.length) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
  }
  return { canceled };
}

async function revokeSubscription(uid, subscription) {
  const meta = subscription.metadata || {};
  const planType = meta.planType || "";
  const subjectId = meta.subjectId || "";
  const current = await getEntitlements(uid);
  const complimentary = current.complimentary === true;
  const next = {
    pack: Boolean(current.pack),
    subjects: { ...(current.subjects || {}) },
  };
  if (complimentary) {
    next.complimentary = true;
    if (current.complimentaryReason) next.complimentaryReason = current.complimentaryReason;
    if (current.complimentaryEmail) next.complimentaryEmail = current.complimentaryEmail;
  }

  if (planType === "pack") {
    next.pack = complimentary ? true : false;
    next.packSubscription = admin.firestore.FieldValue.delete();
  } else if (planType === "subject" && subjectId) {
    delete next.subjects[subjectId];
  }

  await saveEntitlements(uid, next);
}

// 買い切り(Stripe mode=payment)の決済完了を反映する。
// サブスクと違い解約が無いので付与は永続。status に active を入れるのは、
// 既存クライアントの isSubjectActive が status を読むため(互換のため)。
async function applyOneTimePurchase(uid, session) {
  if (!uid || !session) return { ok: false, reason: "no_uid_or_session" };
  const meta = session.metadata || {};
  const planType = meta.planType || "";
  const subjectId = meta.subjectId || "";
  if (session.payment_status && session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }
  const payload = {
    status: "active",
    purchaseType: "one_time",
    checkoutSessionId: session.id || null,
    paymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    amountYen: Number(session.amount_total) || null,
    purchasedAtMs: Date.now(),
  };
  const current = await getEntitlements(uid);
  const next = {
    stripeCustomerId:
      typeof session.customer === "string"
        ? session.customer
        : current.stripeCustomerId || null,
    pack: Boolean(current.pack),
    subjects: { ...(current.subjects || {}) },
  };
  if (current.complimentary === true) {
    next.complimentary = true;
    if (current.complimentaryReason) next.complimentaryReason = current.complimentaryReason;
    if (current.complimentaryEmail) next.complimentaryEmail = current.complimentaryEmail;
  }
  if (planType === "pack") {
    // 買い切りパックは永続。単品の購入記録は消さない(支払った事実を残す)
    next.pack = true;
    next.packPurchase = payload;
  } else if (planType === "subject" && subjectId) {
    next.subjects[subjectId] = payload;
  } else {
    return { ok: false, reason: "unknown_plan" };
  }
  await saveEntitlements(uid, next);
  return { ok: true, planType, subjectId };
}

// 買い切り(mode=payment)の返金・チャージバックで付与を取り消す。
// サブスクの revokeSubscription と違い planType では消さない。
// 支払い1件(paymentIntent / checkoutSession)に紐づく枠だけを消すので、
// 別の科目や、返金後にもう一度買い直した分を巻き込まない。
async function revokeOneTimePurchase(uid, ref) {
  const paymentIntentId = (ref && ref.paymentIntentId) || null;
  const checkoutSessionId = (ref && ref.checkoutSessionId) || null;
  if (!uid || (!paymentIntentId && !checkoutSessionId)) {
    return { ok: false, reason: "no_uid_or_ref" };
  }
  const matches = (rec) => {
    if (!rec || rec.purchaseType !== "one_time") return false;
    if (paymentIntentId && rec.paymentIntentId === paymentIntentId) return true;
    if (checkoutSessionId && rec.checkoutSessionId === checkoutSessionId) return true;
    return false;
  };
  const current = await getEntitlements(uid);
  const complimentary = current.complimentary === true;
  const next = {
    pack: Boolean(current.pack),
    subjects: { ...(current.subjects || {}) },
  };
  if (complimentary) {
    next.complimentary = true;
    if (current.complimentaryReason) next.complimentaryReason = current.complimentaryReason;
    if (current.complimentaryEmail) next.complimentaryEmail = current.complimentaryEmail;
  }
  const removed = [];
  if (matches(current.packPurchase)) {
    next.pack = complimentary ? true : false;
    next.packPurchase = admin.firestore.FieldValue.delete();
    removed.push("pack");
  }
  for (const subjectId of Object.keys(next.subjects)) {
    if (matches(next.subjects[subjectId])) {
      delete next.subjects[subjectId];
      removed.push(subjectId);
    }
  }
  if (removed.length === 0) return { ok: false, reason: "no_matching_purchase" };
  await saveEntitlements(uid, next);
  return { ok: true, removed };
}

module.exports = {
  entitlementsRef,
  applyOneTimePurchase,
  revokeOneTimePurchase,
  getEntitlements,
  saveEntitlements,
  setStripeCustomerId,
  applySubscription,
  revokeSubscription,
  cancelSubjectSubscriptions,
  activeSubscriptionStatuses,
  ensureComplimentaryPack,
  COMPLIMENTARY_PACK_EMAILS,
};
