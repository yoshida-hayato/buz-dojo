/**
 * Stripe Checkout / Customer Portal（Firebase Callable Functions）
 * Functions SDK は初回課金操作時に遅延読込する
 */
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
        alert("お支払いありがとうございます。購読が反映されるまで数十秒かかることがあります。");
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
