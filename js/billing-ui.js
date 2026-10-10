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
  const startBuySubject = $("start-quota-buy-subject-btn");
  const startBuyPack = $("start-quota-buy-pack-btn");
  if (homeBuyPack) {
    homeBuyPack.onclick = () => {
      if (typeof Billing !== "undefined") Billing.startCheckout("pack");
    };
  }
  if (startBuyPack) {
    startBuyPack.onclick = () => {
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
  if (startBuySubject) {
    startBuySubject.onclick = () => {
      if (!CURRENT_SUBJECT || typeof Billing === "undefined") return;
      Billing.startCheckout("subject", CURRENT_SUBJECT.id);
    };
  }
  updateBillingManageVisibility();
}

function updateBillingManageVisibility() {
  const manageBtn = $("billing-manage-btn");
  const homeManage = $("home-billing-manage-btn");
  // 買い切りには解約もカード更新も無いので、契約管理の導線そのものを出さない
  const oneTime =
    typeof Entitlement !== "undefined" &&
    Entitlement.isOneTime &&
    Entitlement.isOneTime();
  const show =
    !oneTime &&
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
  const ownedWord =
    typeof Entitlement !== "undefined" && Entitlement.ownedLabel
      ? Entitlement.ownedLabel()
      : "購読中";
  // ボタンに見える字は動詞だけにする。金額を入れると幅の狭い端末で
  // 「購入 ¥1,980（買い」「切り）」と語の途中で割れる (360 / 390 / 430 / 768 で実測)。
  // 金額は同じカードの1行上の .subject-card-meta が太字で出しているので、
  // ボタンから外しても買う直前に金額が見えなくなることはない。
  // 読み上げソフトにはボタン単体で金額まで要るので aria-label に残す。
  const priceLabel =
    typeof Entitlement !== "undefined" && Entitlement.formatPrice
      ? Entitlement.formatPrice(priceYen)
      : "¥" + Number(priceYen).toLocaleString("ja-JP");
  btn.textContent = subscribed ? ownedWord : "購入する";
  if (subscribed) btn.removeAttribute("aria-label");
  else btn.setAttribute("aria-label", "購入する " + priceLabel);
  btn.disabled = subscribed;
  btn.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof Billing !== "undefined") Billing.startCheckout("subject", subjectId);
  };
}
