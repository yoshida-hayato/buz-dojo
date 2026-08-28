/** 科目選択・起動・ホーム注記 */

async function activateSubject(id, options = {}) {
  if (typeof ensureAppUpdateBeforeLoad === "function") {
    await ensureAppUpdateBeforeLoad();
  }
  const meta =
    typeof SUBJECT_REGISTRY !== "undefined"
      ? SUBJECT_REGISTRY.find((s) => s.id === id)
      : null;
  showSubjectLoading(meta ? meta.title || meta.shortTitle : "");
  try {
    await activateSubjectInner(id, options);
  } finally {
    hideSubjectLoading();
  }
}

function showSubjectLoading(subjectTitle) {
  const overlay = $("subject-loading-overlay");
  const title = $("subject-loading-title");
  const sub = $("subject-loading-sub");
  if (title) title.textContent = "問題を読み込んでいます";
  if (sub) {
    sub.textContent = subjectTitle
      ? `「${subjectTitle}」の問題データを準備中…`
      : "問題データを準備中…";
  }
  if (overlay) {
    overlay.classList.remove("hidden");
    document.body.classList.add("subject-loading-active");
  }
  document.querySelectorAll(".subject-play-btn").forEach((btn) => {
    btn.disabled = true;
    btn.dataset.loadingLocked = "1";
  });
}

function hideSubjectLoading() {
  const overlay = $("subject-loading-overlay");
  if (overlay) overlay.classList.add("hidden");
  document.body.classList.remove("subject-loading-active");
  document.querySelectorAll(".subject-play-btn").forEach((btn) => {
    if (btn.dataset.loadingLocked === "1") {
      btn.disabled = false;
      delete btn.dataset.loadingLocked;
    }
  });
}

async function activateSubjectInner(id, options = {}) {
  uncheckedModules.clear();
  quizEntryById = null;
  const { subject } = await SubjectLoader.loadSubject(id);
  applySubjectConfig(subject);

  if (typeof QuizStorage.useSubject === "function") {
    await QuizStorage.useSubject(subject.id, subject.storageKey);
  }

  const user =
    typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser;
  if (user && QuizStorage.mode !== "cloud" && typeof QuizStorage.switchToCloud === "function") {
    await QuizStorage.switchToCloud(user.uid, firebase.firestore());
  }

  try {
    await ensureQuizModules();
  } catch (e) {
    console.warn("クイズモジュールの読込に失敗:", e);
  }

  if (typeof initSettingsUI === "function") initSettingsUI();
  renderRankBanner("home");
  updateHomeNote();
  if (typeof updatePoolCount === "function") updatePoolCount();
  initChangelogBell();

  const features = subject.features || {};
  const navTcodes = document.querySelector('.nav-btn[data-nav="tcodes"]');
  const navSyntax = document.querySelector('.nav-btn[data-nav="syntax"]');
  const navShortcuts = $("nav-shortcuts") || document.querySelector('.nav-btn[data-nav="shortcuts"]');
  if (navTcodes) navTcodes.classList.toggle("hidden", !features.tcodeBrowser);
  if (navSyntax) navSyntax.classList.toggle("hidden", !features.syntaxBrowser);
  if (navShortcuts) {
    const hasShortcuts =
      typeof QUIZ_DATA !== "undefined" &&
      QUIZ_DATA.some((q) => q && q.category === "shortcut");
    navShortcuts.classList.toggle("hidden", !hasShortcuts);
  }

  if (typeof SubjectLoader !== "undefined" && SubjectLoader.syncUrlForSubject) {
    SubjectLoader.syncUrlForSubject(subject.id);
  }

  // ホームを先に見せてオーバーレイを閉じる（以降はバックグラウンド）
  if (options.afterLoadScreen === "home") {
    if (location.hash === "#mypage") {
      history.replaceState(null, "", location.pathname + (location.search || ""));
    }
    showScreen("home");
  } else if (location.hash === "#stats") {
    await ensureStatsScreen();
    renderStats();
    showScreen("stats");
  } else if (location.hash === "#mypage") {
    await ensureMypage();
    showScreen("mypage");
    renderMyPage();
  } else if (location.hash === "#premium") {
    await ensurePremiumDesk();
    if (typeof openPremiumScreen === "function") {
      const ok = await openPremiumScreen();
      if (!ok) showScreen("home");
    } else {
      showScreen("home");
    }
  } else if (location.hash === "#contact") {
    await ensureAppScripts(["js/screens-contact.js"]);
    await ensureSiteInquiries();
    showContactScreen();
  } else {
    showScreen("home");
  }
  hideSubjectLoading();

  // レガシー取込・Functions・ブラウザデータはホーム後に遅延
  (async () => {
    try {
      await ensureLegacyImportLocal();
    } catch (e) {
      console.warn("レガシー取込スクリプトの読込に失敗:", e);
    }

    const Legacy =
      typeof LegacyStatsImport !== "undefined" ? LegacyStatsImport : window.SapLegacyImport;
    if (Legacy && typeof Legacy.importLocalLegacy === "function") {
      Legacy.importLocalLegacy(id);
    }

    if (user && typeof AppScripts !== "undefined" && AppScripts.ensureFirebaseFunctions) {
      try {
        await AppScripts.ensureFirebaseFunctions();
      } catch (e) {
        console.warn("Functions SDK の読込に失敗:", e);
      }
    }

    if (Legacy && typeof Legacy.run === "function") {
      try {
        const imported = await Legacy.run({ user, tryCloud: !!user, subjectId: id });
        if (imported) {
          await ensureCss(["css/rank.css"]);
          renderRankBanner("home");
          updateHomeNote();
        }
      } catch (e) {
        console.warn("レガシー取込に失敗:", e);
      }
    }

    try {
      await ensureSubjectBrowsers(subject);
    } catch (e) {
      console.warn("科目ブラウザの読込に失敗:", e);
    }

    if (navShortcuts && !navShortcuts.classList.contains("hidden")) {
      if (typeof ShortcutBrowser !== "undefined") ShortcutBrowser.init();
    }
    if (features.tcodeBrowser && typeof TcodeBrowser !== "undefined") TcodeBrowser.init();
    if (features.syntaxBrowser && typeof SyntaxBrowser !== "undefined") SyntaxBrowser.init();

    // ディープリンクでブラウザ画面が指定されている場合のみ切替
    if (location.hash === "#tcodes" && features.tcodeBrowser) {
      showScreen("tcodes");
      if (typeof TcodeBrowser !== "undefined") TcodeBrowser.show();
    } else if (location.hash === "#syntax" && features.syntaxBrowser) {
      showScreen("syntax");
      if (typeof SyntaxBrowser !== "undefined") SyntaxBrowser.show();
    } else if (location.hash === "#shortcuts") {
      const hasShortcuts =
        typeof QUIZ_DATA !== "undefined" &&
        QUIZ_DATA.some((q) => q && q.category === "shortcut");
      if (hasShortcuts) {
        showScreen("shortcuts");
        if (typeof ShortcutBrowser !== "undefined") ShortcutBrowser.show();
      }
    }

    if (sessionStorage.getItem("biz-dojo-start-review") === "1") {
      sessionStorage.removeItem("biz-dojo-start-review");
      if (typeof startReviewQuiz === "function") startReviewQuiz();
    }
  })();
}

function openSubjectPicker() {
  CURRENT_SUBJECT = null;
  if (typeof SubjectLoader !== "undefined") {
    SubjectLoader.clearSelected();
    if (SubjectLoader.syncUrlForPicker) SubjectLoader.syncUrlForPicker();
  }
  const navTcodes = document.querySelector('.nav-btn[data-nav="tcodes"]');
  const navSyntax = document.querySelector('.nav-btn[data-nav="syntax"]');
  const navShortcuts = $("nav-shortcuts") || document.querySelector('.nav-btn[data-nav="shortcuts"]');
  if (navTcodes) navTcodes.classList.add("hidden");
  if (navSyntax) navSyntax.classList.add("hidden");
  if (navShortcuts) navShortcuts.classList.add("hidden");
  showScreen("subjects");
  refreshSubjectPickerCards();
}

function initSubjectPicker() {
  refreshSubjectPickerCards();
}

async function refreshSubjectPickerCards() {
  const box = $("subject-list");
  if (!box || typeof SUBJECT_REGISTRY === "undefined") return;

  const subjects = SUBJECT_REGISTRY.filter((s) => s.enabled);
  box.innerHTML = `<p class="subject-list-loading">成績を読み込み中…</p>`;

  const rows = await Promise.all(
    subjects.map(async (s) => {
      let rank = null;
      let mastered = 0;
      let total = 0;
      let err = false;
      try {
        const summary = await SubjectLoader.loadSubjectSummary(s.id);
        const stats =
          typeof QuizStorage.loadStatsForSubject === "function"
            ? await QuizStorage.loadStatsForSubject(s.id, summary.subject.storageKey)
            : { answered: 0, correct: 0, q: {} };
        const ctx = createRankContext(summary);
        rank = getRankForContext(stats, ctx);
        mastered = ctx.masteredCount(stats);
        total = summary.questionTotal;
      } catch (e) {
        console.warn("科目サマリ読込失敗:", s.id, e);
        err = true;
      }
      return { s, rank, mastered, total, err };
    })
  );

  box.innerHTML = "";
  const packOn =
    typeof Entitlement !== "undefined" &&
    Entitlement.getEntitlements &&
    Entitlement.getEntitlements().pack === true;

  const pickHint = $("subjects-pick-hint");
  if (pickHint) {
    pickHint.innerHTML = packOn
      ? "プレミアムパック会員の方は、すべての科目を<strong>制限なく</strong>学習できます。科目ごとの成績は分かれます。"
      : "同じ形のクイズで、さまざまなビジネス学習ができます。科目ごとの成績は分かれます。各問題集は<strong>1日20問まで無料</strong>です。";
  }
  const supportNotice = $("subjects-support-notice");
  const thanksNotice = $("subjects-thanks-notice");
  if (supportNotice) supportNotice.classList.toggle("hidden", packOn);
  if (thanksNotice) thanksNotice.classList.toggle("hidden", !packOn);
  if (typeof updatePremiumNavLock === "function") updatePremiumNavLock();

  for (const { s, rank, mastered, total, err } of rows) {
    const card = document.createElement("div");
    card.className = "subject-card subject-card-wrap";
    if (s.accent) card.style.setProperty("--subject-accent", s.accent);

    let statsHtml;
    let priceYen = 0;
    let hasAccess = false;
    if (err) {
      statsHtml = `<div class="subject-card-stats is-muted">成績を読み込めませんでした</div>`;
    } else if (total === 0) {
      statsHtml = `<div class="subject-card-stats is-muted">問題データなし</div>`;
    } else {
      const pct = Math.round((mastered / total) * 100);
      const rankBlock = rank
        ? `<div class="subject-card-rank">` +
          `<span class="subject-card-rank-badge" style="background:${rank.color};color:${rank.fg}">${escapeHtml(rank.name)}</span>` +
          `<span class="subject-card-rank-alias">${escapeHtml(rank.alias)}</span>` +
          `</div>`
        : "";
      const statsText =
        mastered > 0 || (rank && rank.name !== DEFAULT_RANKS[0].name)
          ? `習得 ${mastered} / ${total}問（${pct}%）`
          : `未プレイ · 全${total}問`;
      let priceMeta = "";
      if (typeof Entitlement !== "undefined") {
        priceYen =
          typeof s.priceYen === "number"
            ? s.priceYen
            : Entitlement.priceForQuestionCount(total);
        const freeSubject = priceYen <= 0;
        hasAccess = Entitlement.hasAccess(s.id);
        const rem = Entitlement.remainingFree(s.id);
        const freeLabel = freeSubject
          ? "全問無料"
          : hasAccess
            ? packOn
              ? "プレミアム · 無制限"
              : "購読中 · 無制限"
            : `本日あと ${rem}/${Entitlement.FREE_DAILY}問 無料`;
        priceMeta =
          `<div class="subject-card-meta">` +
          (freeSubject || hasAccess
            ? ""
            : `<span class="subject-card-price">${escapeHtml(Entitlement.formatPrice(priceYen))}</span>`) +
          `<span>${escapeHtml(freeLabel)}</span>` +
          `</div>`;
      }
      statsHtml =
        rankBlock +
        `<div class="subject-card-stats">${escapeHtml(statsText)}</div>` +
        priceMeta;
    }

    const freeSubject = priceYen <= 0;
    const playLabel = freeSubject || hasAccess ? "学習する" : "無料で学習";
    card.innerHTML =
      `<div class="subject-card-title">${escapeHtml(s.title)}</div>` +
      `<div class="subject-card-desc">${escapeHtml(s.description || "")}</div>` +
      statsHtml +
      `<div class="subject-card-actions">` +
      `<button type="button" class="primary-btn subject-play-btn">${playLabel}</button>` +
      (freeSubject || hasAccess
        ? ""
        : `<button type="button" class="secondary-btn subject-buy-btn">購入</button>`) +
      `</div>`;

    card.querySelector(".subject-play-btn").addEventListener("click", () => {
      activateSubject(s.id).catch((e) => alert(e.message || "科目の読み込みに失敗しました"));
    });
    const buyBtn = card.querySelector(".subject-buy-btn");
    if (buyBtn) bindSubjectPurchase(buyBtn, s.id, priceYen);
    box.appendChild(card);
  }

  // プレミアム購入済みにはおすすめパックカードを出さない
  if (!packOn && typeof PACK_PLAN !== "undefined" && PACK_PLAN) {
    const pack = document.createElement("div");
    pack.className = "subject-card pack-card";
    const packTitle = PACK_PLAN.title || "プレミアムパック";
    const price =
      typeof Entitlement !== "undefined"
        ? Entitlement.formatPrice(PACK_PLAN.priceYen)
        : `¥${Number(PACK_PLAN.priceYen).toLocaleString("ja-JP")}/月`;
    const benefits = Array.isArray(PACK_PLAN.benefits) ? PACK_PLAN.benefits : [];
    const benefitsHtml = benefits.length
      ? `<ul class="pack-benefits">${benefits
          .map((b) => `<li>${escapeHtml(b)}</li>`)
          .join("")}</ul>`
      : `<div class="pack-card-desc">${escapeHtml(PACK_PLAN.description || "")}</div>`;
    pack.innerHTML =
      `<div class="pack-card-eyebrow">おすすめ</div>` +
      `<div class="pack-card-title">${escapeHtml(packTitle)}</div>` +
      benefitsHtml +
      `<div class="subject-card-meta"><span class="subject-card-price">${escapeHtml(price)}</span>` +
      `<span>単品購読中の場合、購入と同時に単品は解約されます</span></div>` +
      `<div class="subject-card-actions">` +
      `<button type="button" class="primary-btn pack-buy-btn">プレミアムパックを購入</button>` +
      `</div>`;
    const packBtn = pack.querySelector(".pack-buy-btn");
    if (packBtn) {
      packBtn.onclick = () => {
        if (typeof Billing !== "undefined") Billing.startCheckout("pack");
      };
    }
    box.appendChild(pack);
  }
  updateBillingManageVisibility();
}

function updateHomeNote() {
  const saveEl = $("save-mode-note");
  if (saveEl) {
    saveEl.textContent =
      QuizStorage.mode === "cloud"
        ? "成績はアカウントに保存されます（オフライン時は端末に保存し、復帰後に同期します）"
        : "成績はこのブラウザに保存されています（ログインするとアカウントに保存できます）";
  }
  const quotaEl = $("free-quota-note");
  const planCard = $("home-plan-card");
  const planTitle = $("home-plan-title");
  const paywallNotice = $("plan-paywall-notice");
  const paywallText = $("plan-paywall-text");
  const billingActions = $("home-billing-actions");
  const homeBuySubject = $("home-buy-subject-btn");
  const homeBuyPack = $("home-buy-pack-btn");

  if (!CURRENT_SUBJECT || typeof Entitlement === "undefined") {
    if (quotaEl) quotaEl.textContent = "";
    if (planCard) planCard.classList.add("hidden");
    if (paywallNotice) paywallNotice.classList.add("hidden");
    if (planCard) planCard.classList.remove("plan-exhausted");
    return;
  }

  const sid = CURRENT_SUBJECT.id;
  const priceYen = Entitlement.priceForQuestionCount(
    typeof QUIZ_DATA !== "undefined" ? QUIZ_DATA.length : 0
  );
  const priceLabel = Entitlement.formatPrice(priceYen);
  const freeSubject = priceYen <= 0 || Entitlement.isFreeSubject(sid);
  const packOn =
    Entitlement.getEntitlements && Entitlement.getEntitlements().pack === true;
  const hasAccess = Entitlement.hasAccess(sid);

  if (planCard) planCard.classList.remove("hidden");
  if (planTitle) {
    planTitle.textContent = packOn
      ? "プレミアムパック"
      : hasAccess && !freeSubject
        ? "ご利用プラン"
        : "プラン・無料枠";
  }

  if (packOn) {
    if (quotaEl) {
      quotaEl.innerHTML =
        "プレミアムパックをご利用いただき<strong>ありがとうございます</strong>。全問題集を制限なく学習できます。";
    }
    if (paywallNotice) paywallNotice.classList.add("hidden");
    if (planCard) planCard.classList.remove("plan-exhausted");
    if (homeBuySubject) homeBuySubject.classList.add("hidden");
    if (homeBuyPack) homeBuyPack.classList.add("hidden");
    if (billingActions) billingActions.classList.remove("hidden");
    updateBillingManageVisibility();
    return;
  }

  if (freeSubject || hasAccess) {
    if (quotaEl) {
      quotaEl.innerHTML = freeSubject
        ? "この問題集は<strong>無料</strong>です（制限なし）"
        : "この問題集は<strong>購読中</strong>です。ご利用ありがとうございます（制限なし）。";
    }
    if (paywallNotice) paywallNotice.classList.add("hidden");
    if (planCard) planCard.classList.remove("plan-exhausted");
    if (billingActions) {
      billingActions.classList.toggle(
        "hidden",
        freeSubject && !Entitlement.hasAnySubscription()
      );
    }
    if (homeBuySubject) {
      if (freeSubject) {
        homeBuySubject.classList.add("hidden");
      } else {
        homeBuySubject.classList.add("hidden");
      }
    }
    if (homeBuyPack) {
      homeBuyPack.classList.toggle(
        "hidden",
        freeSubject && !Entitlement.hasAnySubscription()
      );
      // 単品購読中はパック案内は残す（アップセル）が、購入済み科目では「購読中」ボタンは出さない
      if (hasAccess && !freeSubject) homeBuyPack.classList.remove("hidden");
    }
    updateBillingManageVisibility();
    return;
  }

  if (homeBuySubject) homeBuySubject.classList.remove("hidden");

  const rem = Entitlement.remainingFree(sid);
  if (quotaEl) {
    quotaEl.innerHTML =
      `本日の無料枠: <strong>あと ${rem} / ${Entitlement.FREE_DAILY}問</strong>` +
      `　·　単品 ${escapeHtml(priceLabel)}`;
  }
  if (billingActions) billingActions.classList.remove("hidden");
  if (homeBuySubject) {
    homeBuySubject.disabled = false;
    homeBuySubject.textContent = `この問題集を購入（${priceLabel}）`;
    homeBuySubject.classList.remove("primary-btn", "secondary-btn");
    homeBuySubject.classList.add(rem <= 0 ? "primary-btn" : "secondary-btn");
  }
  if (homeBuyPack) homeBuyPack.classList.remove("hidden");

  const exhausted = rem <= 0;
  if (paywallNotice) paywallNotice.classList.toggle("hidden", !exhausted);
  if (planCard) planCard.classList.toggle("plan-exhausted", exhausted);
  if (paywallText && exhausted) {
    paywallText.textContent =
      `本日の無料${Entitlement.FREE_DAILY}問を使い切りました。単品 ${priceLabel}、またはプレミアムパックで続きを学習できます。翌日になると無料枠がリセットされます。`;
  }
  updateBillingManageVisibility();
}

function goHome() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (!CURRENT_SUBJECT) {
    showScreen("subjects");
    return;
  }
  renderRankBanner("home");
  updateHomeNote();
  if (typeof renderModuleChips === "function") renderModuleChips();
  if (typeof updatePoolCount === "function") updatePoolCount();
  showScreen("home");
}
