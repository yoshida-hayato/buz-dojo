/**
 * Stripe Checkout / Customer Portal（Firebase Callable Functions）
 * Functions SDK は初回課金操作時に遅延読込する
 */
// 買い切りで単品を所有している科目ID。パック所有者は対象外 (もう上げ先が無い)。
// 月額のときは syncSubscriptionAndMaybeCancelSubjects が単品を解約して相殺するので、
// 呼び出し側 (confirmPackUpgrade) が買い切りのときだけ使う。
function ownedPaidSubjectIds(ent) {
  const e = ent || {};
  if (e.pack === true) return [];
  const subs = e.subjects || {};
  return Object.keys(subs)
    .filter(function (id) {
      const s = subs[id];
      if (!s) return false;
      if (s === true) return true;
      const st = s.status || "";
      return st === "active" || st === "trialing";
    })
    .sort();
}

// 単品に実際に払った額。付与時に記録した amountYen を優先し、
// 記録が無い (サブスク時代の付与など) ときは現在の定価で代用する。
function ownedPaidSubjectYen(ent, ids, priceOf) {
  const subs = (ent && ent.subjects) || {};
  const list = Array.isArray(ids) ? ids : [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const row = subs[list[i]];
    const paid = row && typeof row === "object" ? Number(row.amountYen) : NaN;
    const yen =
      Number.isFinite(paid) && paid > 0
        ? paid
        : Number(typeof priceOf === "function" ? priceOf(list[i]) : 0) || 0;
    total += Math.max(0, yen);
  }
  return total;
}

// パックに上げる前に出す警告文。買い切りには解約も相殺も返金も無いので、
// 先に払った単品代はそのまま沈む。沈む額が無ければ空文字を返す。
// 社長判断 2026-10-04: 差額課金ではなく、購入前の警告だけを出す。
function packUpgradeWarningText(ownedCount, ownedYen, packYen) {
  const n = Math.max(0, Number(ownedCount) || 0);
  const owned = Math.max(0, Number(ownedYen) || 0);
  const pack = Math.max(0, Number(packYen) || 0);
  if (n <= 0 || owned <= 0) return "";
  const yen = function (v) {
    return "¥" + Number(v).toLocaleString("ja-JP");
  };
  return (
    "すでに単品を" +
    n +
    "件お持ちです（お支払い済み " +
    yen(owned) +
    "）。プレミアムパックは買い切りのため、お持ちの単品の代金は返金も差額調整もされません。" +
    "このまま進めると、お支払いの合計は " +
    yen(owned + pack) +
    " になります。"
  );
}

// パック購入の直前の確認。月額のときと、沈む額が無いときは何も出さない。
function confirmPackUpgrade() {
  if (typeof Entitlement === "undefined") return true;
  if (!Entitlement.isOneTime || !Entitlement.isOneTime()) return true;
  const ent = Entitlement.getEntitlements();
  const ids = ownedPaidSubjectIds(ent);
  const owned = ownedPaidSubjectYen(ent, ids, function (id) {
    return Entitlement.getSubjectPriceYen(id);
  });
  const packYen =
    typeof PricingConfig !== "undefined" ? PricingConfig.PACK_PRICE_YEN : 0;
  const text = packUpgradeWarningText(ids.length, owned, packYen);
  if (!text) return true;
  return window.confirm(text + " 購入手続きに進みますか。");
}

const Billing = (function () {
  const REGION = "asia-northeast1";
  let functions = null;
  let busy = false;
  /** @type {{ kind: "checkout"|"portal", planType?: string, subjectId?: string } | null} */
  let pendingAction = null;

  function ready() {
    return (
      typeof firebase !== "undefined" &&
      firebase.apps.length > 0 &&
      typeof firebase.functions === "function"
    );
  }

  function init() {
    if (!ready()) return;
    functions = firebase.app().functions(REGION);
  }

  async function ensureReady() {
    if (typeof AppScripts !== "undefined" && AppScripts.ensureFirebaseFunctions) {
      await AppScripts.ensureFirebaseFunctions();
    }
    if (!functions) init();
    return !!functions;
  }

  function currentUser() {
    return firebase.auth && firebase.auth().currentUser;
  }

  function openLoginModal() {
    if (typeof AuthUI !== "undefined" && typeof AuthUI.openModal === "function") {
      AuthUI.openModal({ reason: "checkout" });
      return;
    }
    const btn = document.getElementById("login-btn");
    if (btn) btn.click();
  }

  function clearPendingCheckout() {
    pendingAction = null;
  }

  /** ログイン成功後に保留中の Checkout / Portal を再開 */
  function resumePendingCheckout() {
    if (!pendingAction || !currentUser()) return;
    const action = pendingAction;
    pendingAction = null;
    if (action.kind === "portal") {
      void openPortal();
      return;
    }
    void startCheckout(action.planType, action.subjectId);
  }

  async function startCheckout(planType, subjectId) {
    if (busy) return;
    if (!currentUser()) {
      pendingAction = {
        kind: "checkout",
        planType,
        subjectId: subjectId || undefined,
      };
      openLoginModal();
      return;
    }
    busy = true;
    try {
      const ok = await ensureReady();
      if (!ok) {
        alert("決済機能の初期化に失敗しました。ページを再読み込みしてください。");
        busy = false;
        return;
      }
      const fn = functions.httpsCallable("createCheckoutSession");
      const payload = { planType };
      if (planType === "subject" && subjectId) payload.subjectId = subjectId;
      const res = await fn(payload);
      const url = res.data && res.data.url;
      if (!url) throw new Error("Checkout URL を取得できませんでした");
      window.location.href = url;
    } catch (err) {
      console.error("checkout failed:", err);
      const msg =
        (err && err.message) ||
        (err && err.details) ||
        (err && err.code === "functions/internal" && "決済処理でエラーが発生しました。") ||
        "決済画面を開けませんでした。しばらくしてから再度お試しください。";
      alert(msg);
      busy = false;
    }
  }

  async function openPortal() {
    if (busy) return;
    if (!currentUser()) {
      pendingAction = { kind: "portal" };
      openLoginModal();
      return;
    }
    busy = true;
    try {
      const ok = await ensureReady();
      if (!ok) {
        alert("決済機能の初期化に失敗しました。");
        busy = false;
        return;
      }
      const fn = functions.httpsCallable("createPortalSession");
      const res = await fn({});
      const url = res.data && res.data.url;
      if (!url) throw new Error("Portal URL を取得できませんでした");
      window.location.href = url;
    } catch (err) {
      console.error("portal failed:", err);
      alert(err.message || "契約管理画面を開けませんでした。");
      busy = false;
    }
  }

  function handleCheckoutQuery() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;

    if (checkout === "success") {
      window.setTimeout(() => {
        const oneTime =
          typeof Entitlement !== "undefined" && Entitlement.isOneTime && Entitlement.isOneTime();
        alert(
          oneTime
            ? "お支払いありがとうございます。ご購入が反映されるまで数十秒かかることがあります。"
            : "お支払いありがとうございます。購読が反映されるまで数十秒かかることがあります。"
        );
      }, 300);
    } else if (checkout === "cancel") {
      console.info("checkout canceled");
    }

    params.delete("checkout");
    params.delete("session_id");
    params.delete("portal");
    const q = params.toString();
    const next = window.location.pathname + (q ? "?" + q : "") + window.location.hash;
    window.history.replaceState({}, "", next);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleCheckoutQuery);
  } else {
    handleCheckoutQuery();
  }

  return {
    init,
    ensureReady,
    startCheckout,
    openPortal,
    ready,
    resumePendingCheckout,
    clearPendingCheckout,
  };
})();
