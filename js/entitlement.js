/**
 * 無料枠・購読状態（Stripe 連携）
 *
 * - 問題集ごと 1日20問まで無料（JST）※有料科目のみ
 * - 問題数 ≤100 の科目は単品無料（無制限）
 * - 購読状態は Firestore users/{uid}/private/entitlements（Webhook が更新）
 */
const Entitlement = (function () {
  const P = typeof PricingConfig !== "undefined" ? PricingConfig : null;
  const FREE_DAILY = (P && P.FREE_DAILY) || 20;
  const PRICE_MIN = (P && P.PRICE_MIN) || 290;
  const PRICE_MAX = (P && P.PRICE_MAX) || 980;
  const FREE_SUBJECT_MAX_COUNT = (P && P.FREE_SUBJECT_MAX_COUNT) || 100;
  const PRICE_CAP_COUNT = (P && P.PRICE_CAP_COUNT) || 3000;
  const USAGE_KEY = "biz_dojo_daily_usage_v1";
  const COMPLIMENTARY_PACK_EMAILS = ["yoshida.hayato0126@gmail.com"];

  let cloudEntitlements = null;
  let unsubscribe = null;

  function currentUserEmail() {
    try {
      if (typeof firebase === "undefined" || !firebase.auth) return "";
      const u = firebase.auth().currentUser;
      return u && u.email ? String(u.email).trim().toLowerCase() : "";
    } catch (e) {
      return "";
    }
  }

  function isComplimentaryPackUser() {
    return COMPLIMENTARY_PACK_EMAILS.includes(currentUserEmail());
  }

  function jstDateKey(d = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d);
  }

  function priceForQuestionCount(n) {
    if (P && typeof P.priceForQuestionCount === "function") {
      return P.priceForQuestionCount(n);
    }
    const count = Math.max(0, Number(n) || 0);
    if (count <= FREE_SUBJECT_MAX_COUNT) return 0;
    if (count >= PRICE_CAP_COUNT) return PRICE_MAX;
    const span = PRICE_CAP_COUNT - FREE_SUBJECT_MAX_COUNT;
    const t = Math.min(1, (count - FREE_SUBJECT_MAX_COUNT) / span);
    const raw = PRICE_MIN + t * (PRICE_MAX - PRICE_MIN);
    return Math.round(raw / 10) * 10;
  }

  function resolveQuestionCount(subjectId) {
    if (
      typeof CURRENT_SUBJECT !== "undefined" &&
      CURRENT_SUBJECT &&
      CURRENT_SUBJECT.id === subjectId &&
      typeof QUIZ_DATA !== "undefined" &&
      Array.isArray(QUIZ_DATA)
    ) {
      return QUIZ_DATA.length;
    }
    if (P && P.SUBJECT_CATALOG && P.SUBJECT_CATALOG[subjectId]) {
      return Number(P.SUBJECT_CATALOG[subjectId].questionCount) || 0;
    }
    return null;
  }

  function getSubjectPriceYen(subjectId) {
    if (P && typeof P.getSubjectPriceYen === "function") {
      const catalogYen = P.getSubjectPriceYen(subjectId);
      if (catalogYen != null) {
        const live = resolveQuestionCount(subjectId);
        // カタログとライブが大きくズレないよう、読込済みならライブ優先
        if (
          live != null &&
          typeof CURRENT_SUBJECT !== "undefined" &&
          CURRENT_SUBJECT &&
          CURRENT_SUBJECT.id === subjectId
        ) {
          return priceForQuestionCount(live);
        }
        return catalogYen;
      }
    }
    const n = resolveQuestionCount(subjectId);
    if (n == null) return null;
    return priceForQuestionCount(n);
  }

  function isFreeSubject(subjectId) {
    if (!subjectId) return false;
    if (P && typeof P.isSubjectFree === "function" && P.isSubjectFree(subjectId)) {
      return true;
    }
    const yen = getSubjectPriceYen(subjectId);
    return yen === 0;
  }

  function loadUsage() {
    try {
      const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function saveUsage(map) {
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(map));
    } catch (e) {
      /* ignore */
    }
  }

  function getEntitlements() {
    const base = cloudEntitlements || { pack: false, subjects: {} };
    if (isComplimentaryPackUser()) {
      return Object.assign({}, base, { pack: true, complimentary: true });
    }
    return base;
  }

  function isSubjectActive(subjectId) {
    const e = getEntitlements();
    if (e.pack === true) return true;
    const sub = e.subjects && e.subjects[subjectId];
    if (!sub) return false;
    if (sub === true) return true;
    const status = sub.status || "";
    return status === "active" || status === "trialing";
  }

  function hasAccess(subjectId) {
    if (isFreeSubject(subjectId)) return true;
    return isSubjectActive(subjectId);
  }

  function hasAnySubscription() {
    const e = getEntitlements();
    if (e.pack) return true;
    const subs = e.subjects || {};
    return Object.keys(subs).some((id) => isSubjectActive(id));
  }

  function usedToday(subjectId) {
    const map = loadUsage();
    const day = jstDateKey();
    const row = map[subjectId];
    if (!row || row.date !== day) return 0;
    return Number(row.count) || 0;
  }

  function remainingFree(subjectId) {
    if (hasAccess(subjectId)) return Infinity;
    return Math.max(0, FREE_DAILY - usedToday(subjectId));
  }

  function canStart(subjectId, wantCount) {
    if (hasAccess(subjectId)) return { ok: true, remaining: Infinity };
    const rem = remainingFree(subjectId);
    const want = wantCount === "all" ? rem : Number(wantCount) || 0;
    if (rem <= 0) return { ok: false, remaining: 0, reason: "limit" };
    return { ok: true, remaining: rem, cappedTo: Math.min(want || rem, rem) };
  }

  function recordAnswer(subjectId) {
    if (!subjectId || hasAccess(subjectId)) return;
    const map = loadUsage();
    const day = jstDateKey();
    const row = map[subjectId];
    if (!row || row.date !== day) map[subjectId] = { date: day, count: 1 };
    else map[subjectId] = { date: day, count: (Number(row.count) || 0) + 1 };
    saveUsage(map);
  }

  function formatPrice(yen) {
    const n = Number(yen) || 0;
    if (n <= 0) return "無料";
    return "¥" + n.toLocaleString("ja-JP") + "/月";
  }

  function stopSync() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    cloudEntitlements = null;
  }

  function startSync(uid) {
    stopSync();
    if (
      !uid ||
      typeof firebase === "undefined" ||
      !firebase.firestore ||
      !firebase.apps.length
    ) {
      return Promise.resolve(null);
    }
    const db = firebase.firestore();
    const ref = db.collection("users").doc(uid).collection("private").doc("entitlements");

    // 管理者は支払いなしで pack を Firestore にも付与（ルール・要望送信用）
    if (isComplimentaryPackUser() && firebase.app().functions) {
      firebase
        .app()
        .functions("asia-northeast1")
        .httpsCallable("ensureAdminComplimentaryPack")({})
        .then((res) => {
          if (res && res.data && res.data.pack) {
            cloudEntitlements = Object.assign({}, cloudEntitlements || {}, {
              pack: true,
              complimentary: true,
            });
            if (typeof AppBridge !== "undefined" && AppBridge.notifyEntitlementsChanged) {
              AppBridge.notifyEntitlementsChanged(getEntitlements());
            } else if (typeof window.onEntitlementsChanged === "function") {
              window.onEntitlementsChanged(getEntitlements());
            }
          }
        })
        .catch((err) => console.warn("complimentary pack grant failed:", err));
    }

    return new Promise((resolve) => {
      let first = true;
      unsubscribe = ref.onSnapshot(
        (snap) => {
          cloudEntitlements = snap.exists ? snap.data() : { pack: false, subjects: {} };
          if (first) {
            first = false;
            resolve(getEntitlements());
          }
          if (typeof AppBridge !== "undefined" && AppBridge.notifyEntitlementsChanged) {
            AppBridge.notifyEntitlementsChanged(getEntitlements());
          } else if (typeof window.onEntitlementsChanged === "function") {
            window.onEntitlementsChanged(getEntitlements());
          }
        },
        (err) => {
          console.warn("entitlements sync failed:", err);
          if (first) {
            first = false;
            resolve(isComplimentaryPackUser() ? getEntitlements() : null);
          }
        }
      );
    });
  }

  return {
    FREE_DAILY,
    PRICE_MIN,
    PRICE_MAX,
    FREE_SUBJECT_MAX_COUNT,
    PRICE_CAP_COUNT,
    jstDateKey,
    priceForQuestionCount,
    getSubjectPriceYen,
    isFreeSubject,
    getEntitlements,
    hasAccess,
    hasAnySubscription,
    usedToday,
    remainingFree,
    canStart,
    recordAnswer,
    formatPrice,
    startSync,
    stopSync,
  };
})();
