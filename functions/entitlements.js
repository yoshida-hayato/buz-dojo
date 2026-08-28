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

async function applySubscription(uid, subscription) {
  const meta = subscription.metadata || {};
  const planType = meta.planType || "";
  const subjectId = meta.subjectId || "";
  const status = subscription.status || "";
  const active = activeSubscriptionStatuses().has(status);
  const subPayload = {
    subscriptionId: subscription.id,
    status,
    currentPeriodEnd: subscription.current_period_end || null,
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

module.exports = {
  entitlementsRef,
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
