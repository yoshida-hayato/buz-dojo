/** プレミアム：問題追加・要望デスク */

let premiumScreenWired = false;

function packOnFromEntitlement() {
  return (
    typeof Entitlement !== "undefined" &&
    Entitlement.getEntitlements &&
    Entitlement.getEntitlements().pack === true
  );
}

function updatePremiumNavLock() {
  const btn = $("nav-premium");
  if (!btn) return;
  const unlocked = packOnFromEntitlement();
  btn.classList.toggle("is-locked", !unlocked);
  btn.setAttribute("aria-disabled", unlocked ? "false" : "true");
  btn.title = unlocked
    ? "問題追加・要望デスク（プレミアム限定）"
    : "プレミアムパック限定";
}

function wirePremiumRequestForm() {
  if (premiumScreenWired) return;
  const typeEl = $("premium-request-type");
  const hintEl = $("premium-request-type-hint");
  const subjectEl = $("premium-request-subject");
  const submitBtn = $("premium-request-submit");
  if (!typeEl || !submitBtn) return;
  premiumScreenWired = true;

  function refreshTypeHint() {
    if (!hintEl || typeof PremiumRequests === "undefined") return;
    const hit = PremiumRequests.TYPE_OPTIONS.find((t) => t.id === typeEl.value);
    hintEl.textContent = hit ? hit.hint : "";
  }

  if (typeof PremiumRequests !== "undefined" && PremiumRequests.TYPE_OPTIONS) {
    typeEl.innerHTML = PremiumRequests.TYPE_OPTIONS.map(
      (t) => `<option value="${t.id}">${t.label}</option>`
    ).join("");
    typeEl.addEventListener("change", refreshTypeHint);
    refreshTypeHint();
  }

  if (subjectEl && typeof SUBJECT_REGISTRY !== "undefined") {
    const opts = SUBJECT_REGISTRY.filter((s) => s.enabled)
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}">${escapeHtml(s.shortTitle || s.title)}</option>`
      )
      .join("");
    subjectEl.innerHTML = `<option value="">指定なし</option>` + opts;
  }

  submitBtn.addEventListener("click", async () => {
    const statusEl = $("premium-request-status");
    const msgEl = $("premium-request-message");
    submitBtn.disabled = true;
    if (statusEl) {
      statusEl.classList.remove("hidden", "is-success", "is-error");
      statusEl.textContent = "送信中…";
    }
    try {
      if (typeof PremiumRequests === "undefined") {
        throw new Error("送信モジュールを読み込めませんでした。");
      }
      const subjectId = subjectEl ? subjectEl.value : "";
      const subjectMeta =
        typeof SUBJECT_REGISTRY !== "undefined"
          ? SUBJECT_REGISTRY.find((s) => s.id === subjectId)
          : null;
      await PremiumRequests.submit({
        type: typeEl.value,
        message: msgEl ? msgEl.value : "",
        subjectId,
        subjectTitle: subjectMeta ? subjectMeta.title : "",
      });
      if (msgEl) msgEl.value = "";
      if (statusEl) {
        statusEl.textContent = "送信しました。内容を確認のうえ対応します。";
        statusEl.classList.add("is-success");
      }
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = e && e.message ? e.message : "送信に失敗しました。";
        statusEl.classList.add("is-error");
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function openPremiumScreen() {
  updatePremiumNavLock();
  if (!packOnFromEntitlement()) {
    return false;
  }
  location.hash = "premium";
  wirePremiumRequestForm();
  showScreen("premium");
  return true;
}

function ensurePremiumScreenReady() {
  updatePremiumNavLock();
  if (packOnFromEntitlement()) wirePremiumRequestForm();
}
