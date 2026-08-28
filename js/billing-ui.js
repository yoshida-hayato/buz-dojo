/** ホーム／科目カード周りの課金 UI */

function initBillingUI() {
  const manageBtn = $("billing-manage-btn");
  if (manageBtn) {
    manageBtn.onclick = () => {
      if (typeof Billing !== "undefined") Billing.openPortal();
    };
  }
  const homeBuySubject = $("home-buy-subject-btn");
  const homeBuyPack = $("home-buy-pack-btn");
  const homeManage = $("home-billing-manage-btn");
  if (homeBuyPack) {
    homeBuyPack.onclick = () => {
      if (typeof Billing !== "undefined") Billing.startCheckout("pack");
    };
  }
  if (homeManage) {
    homeManage.onclick = () => {
      if (typeof Billing !== "undefined") Billing.openPortal();
    };
  }
  if (homeBuySubject) {
    homeBuySubject.onclick = () => {
      if (!CURRENT_SUBJECT || typeof Billing === "undefined") return;
      Billing.startCheckout("subject", CURRENT_SUBJECT.id);
    };
  }
  updateBillingManageVisibility();
}

function updateBillingManageVisibility() {
  const manageBtn = $("billing-manage-btn");
  const homeManage = $("home-billing-manage-btn");
  const show =
    typeof Entitlement !== "undefined" &&
    Entitlement.hasAnySubscription &&
    Entitlement.hasAnySubscription();
  if (manageBtn) manageBtn.classList.toggle("hidden", !show);
  if (homeManage) homeManage.classList.toggle("hidden", !show);
}

window.onEntitlementsChanged = function () {
  updateBillingManageVisibility();
  if (typeof updatePremiumNavLock === "function") updatePremiumNavLock();
  if ($("screen-subjects") && !$("screen-subjects").classList.contains("hidden")) {
    refreshSubjectPickerCards();
  }
  if (CURRENT_SUBJECT) updateHomeNote();
  if ($("screen-mypage") && !$("screen-mypage").classList.contains("hidden")) {
    ensureMypage()
      .then(() => renderMyPage())
      .catch((e) => console.warn(e));
  }
  if ($("screen-premium") && !$("screen-premium").classList.contains("hidden")) {
    if (typeof packOnFromEntitlement === "function" && !packOnFromEntitlement()) {
      goHome();
    } else if (typeof ensurePremiumScreenReady === "function") {
      ensurePremiumScreenReady();
    }
  }
};

function bindSubjectPurchase(btn, subjectId, priceYen) {
  if (!btn) return;
  if (Number(priceYen) <= 0) {
    btn.classList.add("hidden");
    return;
  }
  const subscribed =
    typeof Entitlement !== "undefined" && Entitlement.hasAccess(subjectId);
  btn.classList.remove("hidden");
  btn.textContent = subscribed ? "購読中" : `購入 ${Entitlement.formatPrice(priceYen)}`;
  btn.disabled = subscribed;
  btn.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof Billing !== "undefined") Billing.startCheckout("subject", subjectId);
  };
}
