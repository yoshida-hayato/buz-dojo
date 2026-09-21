/** 科目選択・起動・ホーム注記 */

async function activateSubject(id, options = {}) {
  if (typeof ensureAppUpdateBeforeLoad === "function") {
    await ensureAppUpdateBeforeLoad();
  }
  const meta =
    typeof SUBJECT_REGISTRY !== "undefined"
      ? SUBJECT_REGISTRY.find((s) => s.id === id)
      : null;
  showSubjectLoading(meta ? meta.shortTitle || meta.title : "");
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
  homeChapterSelectedId = null;
  const { subject } = await SubjectLoader.loadSubject(id);
  applySubjectConfig(subject);

  if (typeof QuizStorage.useSubject === "function") {
    // useSubject は local 即載せ→クラウド。次の一手は local 時点で先描画可
    const subjectStatsP = QuizStorage.useSubject(subject.id, subject.storageKey);
    updateHomeNextMove();
    await subjectStatsP;
    updateHomeNextMove();
  }

  const user =
    typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser;
  if (user && QuizStorage.mode !== "cloud" && typeof QuizStorage.switchToCloud === "function") {
    updateHomeNextMove();
    await QuizStorage.switchToCloud(user.uid, firebase.firestore());
    updateHomeNextMove();
  }

  if (
    typeof QuizStorage.reconcileForSubject === "function" &&
    typeof QUIZ_DATA !== "undefined"
  ) {
    const choiceIds = new Set(QUIZ_DATA.map((q) => q.id));
    const inputIds = new Set(
      QUIZ_DATA.filter((q) => INPUT_CATEGORIES.has(q.category)).map((q) => q.id)
    );
    const changed = QuizStorage.reconcileForSubject(choiceIds, inputIds);
    if (changed && typeof QuizStorage.persistIfDirty === "function") {
      await QuizStorage.persistIfDirty();
    }
  } else if (
    typeof QuizStorage.syncMasteredCounts === "function" &&
    typeof QUIZ_DATA !== "undefined"
  ) {
    const choiceIds = new Set(QUIZ_DATA.map((q) => q.id));
    const inputIds = new Set(
      QUIZ_DATA.filter((q) => INPUT_CATEGORIES.has(q.category)).map((q) => q.id)
    );
    const changed = QuizStorage.syncMasteredCounts(choiceIds, inputIds);
    if (changed && typeof QuizStorage.persistIfDirty === "function") {
      await QuizStorage.persistIfDirty();
    }
  }

  try {
    await ensureQuizModules();
  } catch (e) {
    console.warn("クイズモジュールの読込に失敗:", e);
  }

  const previewWhyLessonOpened =
    typeof tryPreviewWhyLessonFromUrl === "function" &&
    tryPreviewWhyLessonFromUrl();

  if (
    typeof ChapterProgress !== "undefined" &&
    ChapterProgress.hasTextbook(subject)
  ) {
    const ch = ChapterProgress.applyTextbookModuleFilter(subject);
    if (ch) homeChapterSelectedId = ch.id;
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
  if (previewWhyLessonOpened) {
    /* ?preview=why — レッスン画面を維持 */
  } else if (options.afterLoadScreen === "home") {
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

    // SAP 成績の詳細(q)や正誤ログが薄い／潰れているときは過去アプリから強制取り込み
    const sapAnswered = Number(QuizStorage.stats && QuizStorage.stats.answered) || 0;
    const sapQ =
      QuizStorage._qMapSize && QuizStorage._qMapSize(QuizStorage.stats && QuizStorage.stats.q);
    const sapChoiceLog = Array.isArray(QuizStorage.stats && QuizStorage.stats.choiceLog)
      ? QuizStorage.stats.choiceLog.length
      : 0;
    const sapChoiceAttempts = Math.max(
      0,
      sapAnswered - (Number(QuizStorage.stats && QuizStorage.stats.inputAnswered) || 0)
    );
    const looksWiped =
      id === "sap" &&
      typeof QuizStorage !== "undefined" &&
      (sapAnswered < 50 ||
        (sapAnswered >= 50 && sapQ < Math.max(50, Math.floor(sapAnswered * 0.02))) ||
        (sapChoiceAttempts >= 100 &&
          sapChoiceLog < Math.max(50, Math.floor(sapChoiceAttempts * 0.25))));

    if (Legacy && typeof Legacy.run === "function") {
      try {
        const imported = await Legacy.run({
          user,
          tryCloud: !!user,
          subjectId: id,
          force: looksWiped,
        });
        if (imported || looksWiped) {
          if (typeof QuizStorage.useSubject === "function") {
            await QuizStorage.useSubject(subject.id, subject.storageKey);
          }
          if (typeof QuizStorage._recoverThinStats === "function") {
            QuizStorage.stats = QuizStorage._recoverThinStats(
              QuizStorage.stats,
              QuizStorage.subjectId
            );
            QuizStorage._writeLocal();
          }
          if (
            typeof QuizStorage.reconcileForSubject === "function" &&
            typeof QUIZ_DATA !== "undefined"
          ) {
            const choiceIds = new Set(QUIZ_DATA.map((q) => q.id));
            const inputIds = new Set(
              QUIZ_DATA.filter((q) => INPUT_CATEGORIES.has(q.category)).map((q) => q.id)
            );
            QuizStorage.reconcileForSubject(choiceIds, inputIds);
          }
          if (
            looksWiped &&
            QuizStorage._ensureCloudAuth &&
            QuizStorage._ensureCloudAuth() &&
            (QuizStorage._qMapSize(QuizStorage.stats.q) > 50 ||
              (Number(QuizStorage.stats.answered) || 0) > 50)
          ) {
            await QuizStorage.persistIfDirty();
          }
          await ensureCss(["css/rank.css"]);
          renderRankBanner("home");
          updateHomeNote();
          if (
            typeof renderStats === "function" &&
            $("screen-stats") &&
            !$("screen-stats").classList.contains("hidden")
          ) {
            renderStats();
          }
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

/** 科目ピッカー描画の世代（古い非同期結果で上書きしない） */
let _pickerRefreshGen = 0;
/** 直近描画の指紋（ちらつき抑制） */
let _pickerPaintFingerprint = "";

function enabledSubjectsSorted() {
  if (typeof SUBJECT_REGISTRY === "undefined") return [];
  // じっくり学ぶ（応用・判断）を上、すぐ使える（操作）を下。同帯内は homeFeatured → レジストリ順
  const tierRank = (s) => (s.depthTier === "depth" ? 0 : 1);
  return SUBJECT_REGISTRY.filter((s) => s.enabled)
    .slice()
    .sort((a, b) => {
      const td = tierRank(a) - tierRank(b);
      if (td !== 0) return td;
      const af = a.homeFeatured ? 1 : 0;
      const bf = b.homeFeatured ? 1 : 0;
      return bf - af;
    });
}

/** catalog 同期値（PricingConfig / session cache）。待ちなしでカードを出したいとき用 */
function syncCatalogCountsForPicker(subjects) {
  const counts = {};
  for (const s of subjects) {
    if (typeof SubjectCatalog !== "undefined" && SubjectCatalog.getQuestionCountSync) {
      counts[s.id] = SubjectCatalog.getQuestionCountSync(s.id);
    } else if (
      typeof PricingConfig !== "undefined" &&
      PricingConfig.SUBJECT_CATALOG &&
      PricingConfig.SUBJECT_CATALOG[s.id]
    ) {
      counts[s.id] = Number(PricingConfig.SUBJECT_CATALOG[s.id].questionCount) || 0;
    } else {
      counts[s.id] = Number(s.questionCount) || 0;
    }
  }
  return counts;
}

function pickerRowsFingerprint(rows) {
  return rows
    .map((r) => {
      const rankName = (r.rank && r.rank.name) || "";
      return [r.s.id, r.total, r.mastered, r.answered, rankName, r.err ? 1 : 0].join(":");
    })
    .join("|");
}

/**
 * 科目カード用行データ。SubjectLoader.loadSubjectSummary は呼ばない
 *（catalog 件数 + 成績サマリだけで足り、subject.js 二重取得を避ける）。
 */
function buildPickerRows(subjects, catalogCounts, allSummaries, summariesLoaded) {
  return subjects.map((s) => {
    let rank = null;
    let mastered = 0;
    let total = 0;
    let answered = 0;
    let err = false;
    try {
      total =
        (catalogCounts && Number(catalogCounts[s.id])) ||
        (typeof SubjectCatalog !== "undefined"
          ? SubjectCatalog.getQuestionCountSync(s.id)
          : 0) ||
        0;
      let row = { masteredChoice: 0, answered: 0, correct: 0 };
      if (summariesLoaded) {
        row =
          (allSummaries && allSummaries[s.id]) ||
          (typeof SubjectSummary !== "undefined" ? SubjectSummary.empty() : row);
      } else if (typeof SubjectSummary !== "undefined") {
        row = SubjectSummary.getLocal(s.id);
      }
      if (typeof QuizStorage !== "undefined" && QuizStorage._displaySummary) {
        row = QuizStorage._displaySummary(row);
      }
      mastered = Number(row.masteredChoice) || 0;
      answered = Number(row.answered) || 0;
      const hasProgress = answered > 0 || mastered > 0;
      if (
        hasProgress &&
        typeof getRankForContext === "function" &&
        typeof createPickerRankContext === "function"
      ) {
        rank = getRankForContext(row, createPickerRankContext(total, s.id));
        if (rank && typeof SubjectSummary !== "undefined" && summariesLoaded) {
          const snapped = SubjectSummary.normalize({
            ...row,
            rankName: rank.name || "",
            rankAlias: rank.alias || "",
            rankColor: rank.color || "",
            rankFg: rank.fg || "",
          });
          SubjectSummary.setLocal(s.id, snapped);
          if (allSummaries && allSummaries[s.id]) allSummaries[s.id] = snapped;
        }
      } else if (hasProgress && typeof SubjectSummary !== "undefined") {
        rank = SubjectSummary.rankFrom(row);
      }
      if (!rank && hasProgress && typeof DEFAULT_RANKS !== "undefined") {
        rank = DEFAULT_RANKS[0];
      }
    } catch (e) {
      console.warn("科目サマリ組立失敗:", s.id, e);
      err = true;
    }
    return { s, rank, mastered, total, answered, err };
  });
}

function paintSubjectPickerSkeleton(box, count) {
  const n = Math.max(1, Number(count) || 1);
  box.innerHTML = Array.from({ length: n }, () => {
    return (
      `<div class="subject-card subject-card-skeleton" aria-hidden="true">` +
      `<div class="skel-line skel-title"></div>` +
      `<div class="skel-line skel-desc"></div>` +
      `<div class="skel-line skel-meta"></div>` +
      `</div>`
    );
  }).join("");
  _pickerPaintFingerprint = "";
}

function paintSubjectPickerCards(box, rows, packOn) {
  const fp = pickerRowsFingerprint(rows) + "|pack:" + (packOn ? 1 : 0);
  if (
    fp === _pickerPaintFingerprint &&
    box.children.length > 0 &&
    !box.querySelector(".subject-card-skeleton")
  ) {
    return;
  }
  _pickerPaintFingerprint = fp;
  box.innerHTML = "";

  let lastTier = null;
  const tierHeadingLabel = (tier) =>
    tier === "depth" ? "じっくり学ぶ（応用・判断）" : "すぐ使える（操作）";

  for (const { s, rank, mastered, total, answered, err } of rows) {
    const tier = s.depthTier === "depth" ? "depth" : "ops";
    if (tier !== lastTier) {
      const heading = document.createElement("h3");
      heading.className = "subject-tier-heading";
      heading.textContent = tierHeadingLabel(tier);
      box.appendChild(heading);
      lastTier = tier;
    }
    const card = document.createElement("div");
    card.className = "subject-card subject-card-wrap";
    if (s.accent) card.style.setProperty("--subject-accent", s.accent);

    let statsHtml;
    let priceYen = 0;
    let hasAccess = false;
    let freeSubject = false;
    if (err) {
      statsHtml = `<div class="subject-card-stats is-muted">成績を読み込めませんでした</div>`;
    } else if (total === 0) {
      statsHtml = `<div class="subject-card-stats is-muted">問題データなし</div>`;
    } else {
      const hasProgress = mastered > 0 || answered > 0;
      const displayRank = hasProgress ? rank : null;
      const rankBlock = displayRank
        ? `<div class="subject-card-rank">` +
          `<span class="subject-card-rank-badge" style="background:${displayRank.color};color:${displayRank.fg}">${escapeHtml(displayRank.name)}</span>` +
          `<span class="subject-card-rank-alias">${escapeHtml(displayRank.alias)}</span>` +
          `</div>`
        : "";
      // 第7回採択: 絶対数を主・%は従（計算は非接触）
      let progressHtml;
      if (hasProgress && typeof MasteryDisplay !== "undefined") {
        progressHtml = MasteryDisplay.formatMastery(mastered, total).html;
      } else if (hasProgress) {
        const pct = Math.round((mastered / total) * 100);
        progressHtml = escapeHtml(`習得 ${mastered}/${total}（${pct}%）`);
      } else {
        progressHtml = escapeHtml(`全${total}問`);
      }
      const metaParts = [];
      if (typeof Entitlement !== "undefined") {
        priceYen =
          typeof s.priceYen === "number"
            ? s.priceYen
            : Entitlement.priceForQuestionCount(total);
        freeSubject = priceYen <= 0;
        hasAccess = Entitlement.hasAccess(s.id);
        const rem = Entitlement.remainingFree(s.id);
        const accessLabel = freeSubject
          ? "全問無料"
          : hasAccess
            ? packOn
              ? "プレミアム"
              : "購読中"
            : `本日あと${rem}/${Entitlement.FREE_DAILY}`;
        if (!freeSubject && !hasAccess) {
          metaParts.push(
            `<span class="subject-card-price">${escapeHtml(Entitlement.formatPrice(priceYen))}</span>`
          );
        }
        metaParts.push(`<span class="subject-card-access">${escapeHtml(accessLabel)}</span>`);
      }
      metaParts.push(`<span class="subject-card-progress">${progressHtml}</span>`);
      let denomNoteHtml = "";
      if (
        typeof MasteryDisplay !== "undefined" &&
        hasProgress
      ) {
        const note = MasteryDisplay.denomGrowthNote(s.id, total, true);
        if (note) {
          denomNoteHtml = `<div class="subject-card-note">${escapeHtml(note)}</div>`;
        }
      }
      statsHtml =
        rankBlock +
        `<div class="subject-card-meta">${metaParts.join("")}</div>` +
        denomNoteHtml;
    }

    const playLabel = freeSubject || hasAccess ? "学習する" : "無料で学習";
    const displayTitle = s.shortTitle || s.title;
    // 帯見出しと同文言の eyebrow は出さない（Teams等の差分 eyebrow は残す）
    // FREE_ENTRY: 「無料で始められる」緑帯は操作帯のみ。じっくり帯の無料（入門）は操作入口と見せない
    const tierLabel = tierHeadingLabel(tier);
    const opsFreeEntry = freeSubject && tier === "ops";
    const rawEyebrow = (s.cardEyebrow || "").trim();
    const showRegistryEyebrow = rawEyebrow && rawEyebrow !== tierLabel;
    const eyebrow = showRegistryEyebrow
      ? `<div class="subject-card-eyebrow">${escapeHtml(rawEyebrow)}</div>`
      : opsFreeEntry
        ? `<div class="subject-card-eyebrow is-free">無料で始められる</div>`
        : freeSubject
          ? ""
          : !err && total > 0
            ? `<div class="subject-card-eyebrow">1日20問まで無料</div>`
            : "";
    if (s.homeFeatured) card.classList.add("is-featured");
    if (opsFreeEntry) card.classList.add("is-free-entry");
    else if (!err && total > 0 && !freeSubject) card.classList.add("is-paid-entry");
    card.innerHTML =
      eyebrow +
      `<div class="subject-card-title">${escapeHtml(displayTitle)}</div>` +
      (s.description
        ? `<div class="subject-card-desc">${escapeHtml(s.description)}</div>`
        : "") +
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
          .slice(0, 3)
          .map((b) => `<li>${escapeHtml(b)}</li>`)
          .join("")}</ul>`
      : `<div class="pack-card-desc">${escapeHtml(PACK_PLAN.description || "")}</div>`;
    pack.innerHTML =
      `<div class="pack-card-eyebrow">おすすめ</div>` +
      `<div class="pack-card-title">${escapeHtml(packTitle)}</div>` +
      benefitsHtml +
      `<div class="subject-card-meta"><span class="subject-card-price">${escapeHtml(price)}</span>` +
      `<span>パック購入時、単品は解約</span></div>` +
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

function updateSubjectPickerNotices(packOn) {
  const pickHint = $("subjects-pick-hint");
  if (pickHint) {
    pickHint.innerHTML = packOn
      ? "プレミアムパック会員の方は、すべての科目を<strong>制限なく</strong>学習できます。科目ごとの成績は分かれます。"
      : "操作だけなら下の「すぐ使える（操作）」帯からで大丈夫です。オントロジーは知識の置き方を学ぶ科目で、操作の代わりではありません。科目ごとの成績は分かれます。100問以下は<strong>全問無料</strong>、それ以外は<strong>1日20問まで無料</strong>です。";
  }
  const supportNotice = $("subjects-support-notice");
  const thanksNotice = $("subjects-thanks-notice");
  if (supportNotice) supportNotice.classList.toggle("hidden", packOn);
  if (thanksNotice) thanksNotice.classList.toggle("hidden", !packOn);
  if (typeof updatePremiumNavLock === "function") updatePremiumNavLock();
}

async function refreshSubjectPickerCards() {
  const box = $("subject-list");
  if (!box || typeof SUBJECT_REGISTRY === "undefined") return;

  const subjects = enabledSubjectsSorted();
  const gen = ++_pickerRefreshGen;
  const packOn =
    typeof Entitlement !== "undefined" &&
    Entitlement.getEntitlements &&
    Entitlement.getEntitlements().pack === true;
  updateSubjectPickerNotices(packOn);

  // A: 同期 catalog + local/メモリサマリで即描画（「成績を読み込み中…」全消しをやめる）
  const syncCounts = syncCatalogCountsForPicker(subjects);
  const localMap =
    typeof SubjectSummary !== "undefined" ? SubjectSummary.readLocalMap() : {};
  const memCache =
    typeof QuizStorage !== "undefined" && QuizStorage._allSummariesCache
      ? QuizStorage._allSummariesCache
      : null;

  // 冷起動でも全消ししない。local/空サマリで即カード → クラウドで更新
  paintSubjectPickerCards(
    box,
    buildPickerRows(
      subjects,
      syncCounts,
      memCache || localMap || {},
      !!memCache
    ),
    packOn
  );

  // バックグラウンドで catalog + 全科目サマリを更新（科目ごとの subject.js は取らない）
  try {
    const [catalogCounts, allSummaries] = await Promise.all([
      typeof SubjectCatalog !== "undefined"
        ? SubjectCatalog.loadAll()
        : Promise.resolve(syncCounts),
      typeof QuizStorage !== "undefined" &&
      typeof QuizStorage.loadAllSubjectSummaries === "function"
        ? QuizStorage.loadAllSubjectSummaries()
        : typeof QuizStorage !== "undefined" &&
            typeof QuizStorage.loadAllStatsSummaries === "function"
          ? QuizStorage.loadAllStatsSummaries()
          : Promise.resolve(localMap || {}),
    ]);
    if (gen !== _pickerRefreshGen) return;

    const summariesLoaded =
      allSummaries && typeof allSummaries === "object" && !Array.isArray(allSummaries);
    const rows = buildPickerRows(
      subjects,
      catalogCounts || syncCounts,
      allSummaries,
      !!summariesLoaded
    );
    paintSubjectPickerCards(box, rows, packOn);
  } catch (e) {
    console.warn("科目ピッカー更新に失敗:", e);
    if (gen !== _pickerRefreshGen) return;
    if (box.querySelector(".subject-card-skeleton")) {
      paintSubjectPickerCards(
        box,
        buildPickerRows(subjects, syncCounts, localMap || {}, false),
        packOn
      );
    }
  }
}

/** 科目ホームの復習導線（主CTAは出題設定の「クイズを開始する」。復習は副次） */
/** 教科書モード時に選択中の章（アンロックのみ）。null なら currentChapter */
let homeChapterSelectedId = null;
let homeChapterUiWired = false;

function subjectUsesTextbookHome() {
  return (
    typeof ChapterProgress !== "undefined" &&
    CURRENT_SUBJECT &&
    ChapterProgress.hasTextbook(CURRENT_SUBJECT)
  );
}

const TEXTBOOK_RANK_HINT =
  "段位は参考です。いまの章の進みは下の「学習の章」で確認してください。";
const DEFAULT_RANK_HINT = "累計成績の詳細は「成績・段位」で確認できます";

function updateTextbookHomeRankFocus() {
  const banner = document.querySelector("#screen-home .rank-banner");
  const hint = document.querySelector("#screen-home .home-rank-hint");
  if (!banner) return;
  if (subjectUsesTextbookHome()) {
    banner.classList.add("is-textbook-focus");
    if (hint) hint.textContent = TEXTBOOK_RANK_HINT;
  } else {
    banner.classList.remove("is-textbook-focus");
    if (hint) hint.textContent = DEFAULT_RANK_HINT;
  }
}

function wireHomeChapterUiOnce() {
  if (homeChapterUiWired) return;
  const continueBtn = $("home-chapter-continue-btn");
  if (!continueBtn) return;
  homeChapterUiWired = true;
  continueBtn.addEventListener("click", () => {
    if (!subjectUsesTextbookHome()) return;
    if (
      typeof LessonProgress !== "undefined" &&
      LessonProgress.hasLesson(CURRENT_SUBJECT)
    ) {
      const progress = ChapterProgress.load(CURRENT_SUBJECT);
      let ch =
        (homeChapterSelectedId &&
          ChapterProgress.getChapter(CURRENT_SUBJECT, homeChapterSelectedId)) ||
        ChapterProgress.currentChapter(CURRENT_SUBJECT, progress);
      if (
        ch &&
        ch.id === "intro" &&
        !LessonProgress.lessonComplete(CURRENT_SUBJECT, "intro") &&
        typeof openLesson === "function"
      ) {
        openLesson("intro");
        return;
      }
      if (
        ch &&
        ch.id === "why" &&
        LessonProgress.chapterLesson("why") &&
        !LessonProgress.lessonComplete(CURRENT_SUBJECT, "why") &&
        typeof openLesson === "function"
      ) {
        openLesson("why");
        return;
      }
    }
    if (typeof isFreeQuotaExhausted === "function" && isFreeQuotaExhausted()) {
      if (typeof showFreeQuotaExhaustedAtStart === "function") {
        showFreeQuotaExhaustedAtStart();
      }
      return;
    }
    const progress = ChapterProgress.load(CURRENT_SUBJECT);
    let ch =
      (homeChapterSelectedId &&
        ChapterProgress.getChapter(CURRENT_SUBJECT, homeChapterSelectedId)) ||
      ChapterProgress.currentChapter(CURRENT_SUBJECT, progress);
    // クリア済み選択＋次章アンロック時は「次の章を始める」に合わせて次章へ
    if (
      ch &&
      ChapterProgress.isCleared(progress, ch.id) &&
      !ChapterProgress.allCleared(CURRENT_SUBJECT, progress)
    ) {
      const chapters = ChapterProgress.sortedChapters(CURRENT_SUBJECT);
      const idx = chapters.findIndex((c) => c.id === ch.id);
      const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
      if (next && ChapterProgress.isUnlocked(CURRENT_SUBJECT, progress, next.id)) {
        ch = next;
        homeChapterSelectedId = next.id;
      }
    }
    if (!ch || !ChapterProgress.isUnlocked(CURRENT_SUBJECT, progress, ch.id)) {
      return;
    }
    ChapterProgress.selectModuleOnly(ch.module);
    if (typeof renderModuleChips === "function") renderModuleChips();
    if (typeof updatePoolCount === "function") updatePoolCount();
    if (
      typeof startQuiz === "function" &&
      typeof getSettings === "function" &&
      $("start-btn") &&
      !$("start-btn").disabled
    ) {
      startQuiz(getSettings());
      return;
    }
    const settingsCard = document.querySelector(".settings-card");
    if (settingsCard) settingsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const bridgeBtn = $("home-chapter-bridge-btn");
  if (bridgeBtn && !bridgeBtn.dataset.wiredBridge) {
    bridgeBtn.dataset.wiredBridge = "1";
    bridgeBtn.addEventListener("click", () => {
      if (!CURRENT_SUBJECT || CURRENT_SUBJECT.id !== "ai-ontology-intro") return;
      const progress = ChapterProgress.load(CURRENT_SUBJECT);
      if (!ChapterProgress.allCleared(CURRENT_SUBJECT, progress)) return;
      activateSubject("ai-ontology-core");
    });
  }
}

function updateHomeChapterPreviewWhyBridge(progress, chapters, current) {
  const el = $("home-chapter-preview-why");
  if (!el) return;
  if (
    !CURRENT_SUBJECT ||
    CURRENT_SUBJECT.id !== "ai-ontology-intro" ||
    typeof previewWhyTrialAvailable !== "function" ||
    !previewWhyTrialAvailable()
  ) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const introCh = chapters.find((c) => c.id === "intro");
  const whyCh = chapters.find((c) => c.id === "why");
  if (!introCh || !whyCh || ChapterProgress.isCleared(progress, whyCh.id)) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  if (ChapterProgress.allCleared(CURRENT_SUBJECT, progress)) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const introLessonDone =
    typeof LessonProgress !== "undefined" &&
    LessonProgress.hasLesson(CURRENT_SUBJECT) &&
    LessonProgress.lessonComplete(CURRENT_SUBJECT, "intro");
  const onIntroChapter =
    homeChapterSelectedId === introCh.id ||
    (current && current.id === introCh.id);
  if (!introLessonDone && !onIntroChapter) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const href =
    typeof previewWhyTrialHref === "function"
      ? previewWhyTrialHref()
      : "?subject=ai-ontology-intro&preview=why";
  el.innerHTML = `<a href="${escapeHtml(href)}">第2章「なぜ型で置くか」を試し読みする</a>`;
  el.classList.remove("hidden");
}

function updateHomeChapterCard() {
  const card = $("home-chapter-card");
  const list = $("home-chapter-list");
  const hint = $("home-chapter-hint");
  const continueBtn = $("home-chapter-continue-btn");
  if (!card || !list) return;

  if (!subjectUsesTextbookHome()) {
    card.classList.add("hidden");
    list.innerHTML = "";
    if (hint) hint.textContent = "";
    const previewBridgeReset = $("home-chapter-preview-why");
    if (previewBridgeReset) {
      previewBridgeReset.classList.add("hidden");
      previewBridgeReset.innerHTML = "";
    }
    homeChapterSelectedId = null;
    const bridgeBtnReset = $("home-chapter-bridge-btn");
    if (bridgeBtnReset) bridgeBtnReset.classList.add("hidden");
    updateTextbookHomeRankFocus();
    // 非教科書に戻したら開始CTAを通常の主ボタンに戻す
    const startBtnReset = $("start-btn");
    if (startBtnReset) {
      startBtnReset.textContent = "クイズを開始する";
      startBtnReset.classList.add("primary-btn");
      startBtnReset.classList.remove("secondary-btn");
    }
    return;
  }

  wireHomeChapterUiOnce();
  const progress = ChapterProgress.load(CURRENT_SUBJECT);
  const chapters = ChapterProgress.sortedChapters(CURRENT_SUBJECT);
  const current = ChapterProgress.currentChapter(CURRENT_SUBJECT, progress);
  if (
    !homeChapterSelectedId ||
    !ChapterProgress.isUnlocked(CURRENT_SUBJECT, progress, homeChapterSelectedId)
  ) {
    homeChapterSelectedId = current ? current.id : null;
  }

  list.innerHTML = "";
  chapters.forEach((ch) => {
    const unlocked = ChapterProgress.isUnlocked(CURRENT_SUBJECT, progress, ch.id);
    const cleared = ChapterProgress.isCleared(progress, ch.id);
    const got = ChapterProgress.correctCount(progress, ch.id);
    const need = Number(ch.clearCorrect) || 0;
    const selected = homeChapterSelectedId === ch.id;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "home-chapter-item" +
      (selected ? " is-current" : "") +
      (cleared ? " is-cleared" : "") +
      (!unlocked ? " is-locked" : "");
    btn.disabled = !unlocked;
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    let mark;
    let meta;
    if (!unlocked) {
      mark = "ロック";
      const idx = chapters.findIndex((c) => c.id === ch.id);
      const prev = idx > 0 ? chapters[idx - 1] : null;
      const prevNeed = prev ? Number(prev.clearCorrect) || 0 : 0;
      meta = prev
        ? `第${prev.order}章で正解${prevNeed}問`
        : "まだ開けません";
    } else if (cleared) {
      mark = "済";
      meta = `この章の到達 ${Math.min(got, need)}/${need}`;
    } else {
      mark = "学習中";
      meta = `この章の到達 ${Math.min(got, need)}/${need}`;
    }
    btn.innerHTML =
      `<span class="home-chapter-mark" aria-hidden="true">${mark}</span>` +
      `<span class="home-chapter-body">` +
      `<span class="home-chapter-title">第${ch.order}章 ${escapeHtml(ch.module)}</span>` +
      `<span class="home-chapter-meta">${escapeHtml(meta)}</span>` +
      `</span>`;
    if (unlocked) {
      btn.addEventListener("click", () => {
        homeChapterSelectedId = ch.id;
        ChapterProgress.selectModuleOnly(ch.module);
        if (typeof renderModuleChips === "function") renderModuleChips();
        if (typeof updatePoolCount === "function") updatePoolCount();
        updateHomeChapterCard();
      });
    }
    li.appendChild(btn);
    list.appendChild(li);
  });

  card.classList.remove("hidden");

  // 基礎誘導は全クリア後だけ。購入語は出さない（FREE_ENTRY）
  // 導入章クリア後だけ「なぜ型で置くか」へ一文（早期の基礎押しなし）
  if (hint) {
    if (
      typeof previewWhyLessonPending === "function" &&
      previewWhyLessonPending()
    ) {
      hint.textContent = "第2章先読みは準備中";
      hint.classList.add("is-preview-pending");
    } else {
      hint.classList.remove("is-preview-pending");
      const introCh = chapters.find((c) => c.id === "intro");
      const whyCh = chapters.find((c) => c.module === "なぜ型で置くか");
      const introDone =
        introCh && ChapterProgress.isCleared(progress, introCh.id);
      const whyOpen =
        whyCh && ChapterProgress.isUnlocked(CURRENT_SUBJECT, progress, whyCh.id);
      const whyNotDone =
        whyCh && !ChapterProgress.isCleared(progress, whyCh.id);
      const selectedIntroCleared =
        introDone &&
        homeChapterSelectedId === introCh.id &&
        whyOpen &&
        whyNotDone;

      const introLessonDone =
        introCh &&
        typeof LessonProgress !== "undefined" &&
        LessonProgress.hasLesson(CURRENT_SUBJECT) &&
        LessonProgress.lessonComplete(CURRENT_SUBJECT, "intro");
      const onIntroChapter =
        introCh &&
        (homeChapterSelectedId === introCh.id ||
          (current && current.id === introCh.id));

      if (ChapterProgress.allCleared(CURRENT_SUBJECT, progress)) {
        hint.textContent =
          "用語の入り口はここまでです。続きは「オントロジー基礎」で設計の判断を学べます。";
      } else if (
        introCh &&
        introLessonDone &&
        !introDone &&
        onIntroChapter &&
        typeof introLessonReachHint === "function"
      ) {
        hint.textContent = introLessonReachHint(CURRENT_SUBJECT, "intro");
      } else if (selectedIntroCleared) {
        hint.textContent =
          "導入はここまでです。次は「なぜ型で置くか」へ進み、型が必要な理由に入ります。";
      } else if (
        introDone &&
        whyNotDone &&
        current &&
        whyCh &&
        current.id === whyCh.id
      ) {
        const got = ChapterProgress.correctCount(progress, current.id);
        const need = Number(current.clearCorrect) || 0;
        hint.textContent = `導入の次は「なぜ型で置くか」です。この章の到達が ${Math.min(got, need)}/${need} になると次の章が開きます。`;
      } else if (current) {
        const got = ChapterProgress.correctCount(progress, current.id);
        const need = Number(current.clearCorrect) || 0;
        hint.textContent = `いまは第${current.order}章「${current.module}」です。この章の到達が ${Math.min(got, need)}/${need} になると次の章が開きます。`;
      } else {
        hint.textContent = "";
      }
    }
  }

  updateHomeChapterPreviewWhyBridge(progress, chapters, current);

  // homeNote: 全クリア前は基礎誘導なし。全クリア後だけ控えめに足す
  const homeNoteEl = document.querySelector(".home-note");
  if (homeNoteEl && CURRENT_SUBJECT) {
    const base = (CURRENT_SUBJECT.homeNote || "").trim();
    if (ChapterProgress.allCleared(CURRENT_SUBJECT, progress)) {
      homeNoteEl.textContent =
        (base ? base + " " : "") +
        "用語の入り口はここまでです。続きは「オントロジー基礎」で設計の判断を学べます。";
    } else if (base) {
      homeNoteEl.textContent = base;
    }
  }

  // Phase2: 主CTAは章カード1本のみ。文言だけ次章／復習に切替（二重 primary は維持解消）
  let chapterCtaLabel = "この章を続ける";
  const selForLesson =
    (homeChapterSelectedId &&
      ChapterProgress.getChapter(CURRENT_SUBJECT, homeChapterSelectedId)) ||
    current;
  if (
    typeof LessonProgress !== "undefined" &&
    LessonProgress.hasLesson(CURRENT_SUBJECT) &&
    selForLesson &&
    selForLesson.id === "intro" &&
    !LessonProgress.lessonComplete(CURRENT_SUBJECT, "intro")
  ) {
    chapterCtaLabel = "第1章を読む";
  } else if (
    typeof LessonProgress !== "undefined" &&
    LessonProgress.hasLesson(CURRENT_SUBJECT) &&
    selForLesson &&
    selForLesson.id === "why" &&
    LessonProgress.chapterLesson("why") &&
    !LessonProgress.lessonComplete(CURRENT_SUBJECT, "why")
  ) {
    chapterCtaLabel = "第2章を読む";
  } else if (ChapterProgress.allCleared(CURRENT_SUBJECT, progress)) {
    chapterCtaLabel = "復習する";
  } else if (homeChapterSelectedId) {
    const selCh = ChapterProgress.getChapter(
      CURRENT_SUBJECT,
      homeChapterSelectedId
    );
    if (selCh && ChapterProgress.isCleared(progress, selCh.id)) {
      const chaptersForCta = ChapterProgress.sortedChapters(CURRENT_SUBJECT);
      const selIdx = chaptersForCta.findIndex((c) => c.id === selCh.id);
      const nextCh =
        selIdx >= 0 && selIdx < chaptersForCta.length - 1
          ? chaptersForCta[selIdx + 1]
          : null;
      if (
        nextCh &&
        ChapterProgress.isUnlocked(CURRENT_SUBJECT, progress, nextCh.id)
      ) {
        chapterCtaLabel = "次の章を始める";
      }
    }
  }

  if (continueBtn) {
    const sel =
      (homeChapterSelectedId &&
        ChapterProgress.getChapter(CURRENT_SUBJECT, homeChapterSelectedId)) ||
      current;
    const canGo =
      sel && ChapterProgress.isUnlocked(CURRENT_SUBJECT, progress, sel.id);
    continueBtn.disabled = !canGo;
    continueBtn.classList.add("primary-btn");
    continueBtn.classList.remove("secondary-btn");
    continueBtn.textContent = chapterCtaLabel;
  }

  const bridgeBtn = $("home-chapter-bridge-btn");
  if (bridgeBtn) {
    const showBridge =
      CURRENT_SUBJECT.id === "ai-ontology-intro" &&
      ChapterProgress.allCleared(CURRENT_SUBJECT, progress);
    bridgeBtn.classList.toggle("hidden", !showBridge);
  }

  updateTextbookHomeRankFocus();

  // 出題設定の開始は副次（主CTAと同じ文言に寄せる）
  const startBtn = $("start-btn");
  if (startBtn) {
    startBtn.textContent = chapterCtaLabel;
    startBtn.classList.remove("primary-btn");
    startBtn.classList.add("secondary-btn");
  }
}

function updateHomeNextMove() {
  const card = $("home-next-move");
  const body = $("home-next-move-body");
  const reviewBtn = $("home-review-btn");
  const startBtn = $("home-next-start-btn");
  if (!card || !body) return;

  // 通常開始の重複CTAは出さない（教科書は章カードが主CTA、通常は settings の start-btn）
  if (startBtn) startBtn.classList.add("hidden");

  let startLabel = "クイズを開始する";
  if (subjectUsesTextbookHome()) {
    const progressForLabel = ChapterProgress.load(CURRENT_SUBJECT);
    startLabel = ChapterProgress.allCleared(CURRENT_SUBJECT, progressForLabel)
      ? "復習する"
      : "この章を続ける";
    if (
      startLabel === "この章を続ける" &&
      homeChapterSelectedId &&
      ChapterProgress.isCleared(progressForLabel, homeChapterSelectedId)
    ) {
      const chaptersForLabel = ChapterProgress.sortedChapters(CURRENT_SUBJECT);
      const selIdx = chaptersForLabel.findIndex(
        (c) => c.id === homeChapterSelectedId
      );
      const nextCh =
        selIdx >= 0 && selIdx < chaptersForLabel.length - 1
          ? chaptersForLabel[selIdx + 1]
          : null;
      if (
        nextCh &&
        ChapterProgress.isUnlocked(CURRENT_SUBJECT, progressForLabel, nextCh.id)
      ) {
        startLabel = "次の章を始める";
      }
    }
  }

  if (!CURRENT_SUBJECT || typeof QuizStorage === "undefined") {
    // local/空でもブロック文言だけで真っ白にしない（読込文言禁止）
    card.classList.remove("hidden");
    card.classList.add("is-clear");
    body.textContent =
      `いまつまずいている問題はありません。上の「${startLabel}」から学習できます。`;
    if (reviewBtn) reviewBtn.classList.add("hidden");
    return;
  }

  let wrongCount = 0;
  try {
    const q = QuizStorage.stats && QuizStorage.stats.q;
    wrongCount =
      q && typeof q === "object"
        ? Object.entries(q).filter(([, s]) => s && s.a > s.c).length
        : typeof QuizStorage.wrongIds === "function"
          ? QuizStorage.wrongIds().length
          : 0;
  } catch (e) {
    wrongCount = 0;
  }

  card.classList.remove("hidden");

  if (wrongCount <= 0) {
    // 空サマリでも即表示→クラウド更新で上書き（ピッカー／マイページ同型）
    card.classList.add("is-clear");
    body.textContent =
      `いまつまずいている問題はありません。上の「${startLabel}」から学習できます。`;
    if (reviewBtn) reviewBtn.classList.add("hidden");
    return;
  }

  card.classList.remove("is-clear");
  body.textContent =
    `つまずいた問題が ${wrongCount} 問あります。通常の開始は上の「${startLabel}」から。復習は任意です。`;
  if (reviewBtn) {
    reviewBtn.classList.remove("hidden", "primary-btn");
    reviewBtn.classList.add("secondary-btn");
  }
}

function updateHomeNote() {
  const saveEl = $("save-mode-note");
  if (saveEl) {
    saveEl.textContent =
      QuizStorage.mode === "cloud"
        ? "成績はアカウントに保存されます（オフライン時は端末に保存し、復帰後に同期します）"
        : "成績はこのブラウザに保存されています（ログインするとアカウントに保存できます）";
  }
  updateHomeChapterCard();
  updateHomeNextMove();
  const quotaEl = $("free-quota-note");
  const quotaSummary = $("start-quota-summary");
  const planCard = $("home-plan-card");
  const planTitle = $("home-plan-title");
  const paywallNotice = $("plan-paywall-notice");
  const paywallText = $("plan-paywall-text");
  const billingActions = $("home-billing-actions");
  const homeBuySubject = $("home-buy-subject-btn");
  const homeBuyPack = $("home-buy-pack-btn");

  if (!CURRENT_SUBJECT || typeof Entitlement === "undefined") {
    if (quotaEl) quotaEl.textContent = "";
    if (quotaSummary) {
      quotaSummary.innerHTML = "";
      quotaSummary.classList.add("hidden");
    }
    if (planCard) planCard.classList.add("hidden");
    if (paywallNotice) paywallNotice.classList.add("hidden");
    if (planCard) planCard.classList.remove("plan-exhausted");
    updateStartQuotaGate(false);
    return;
  }

  const sid = CURRENT_SUBJECT.id;
  const totalQ =
    typeof QUIZ_DATA !== "undefined" && Array.isArray(QUIZ_DATA) ? QUIZ_DATA.length : 0;
  const priceYen = Entitlement.priceForQuestionCount(totalQ);
  const priceLabel = Entitlement.formatPrice(priceYen);
  const freeSubject = priceYen <= 0 || Entitlement.isFreeSubject(sid);
  const packOn =
    Entitlement.getEntitlements && Entitlement.getEntitlements().pack === true;
  const hasAccess = Entitlement.hasAccess(sid);

  /** 開始CTA直上の無料枠・問数・単品価格サマリ */
  function setStartQuotaSummary(html) {
    if (!quotaSummary) return;
    if (html) {
      quotaSummary.innerHTML = html;
      quotaSummary.classList.remove("hidden");
    } else {
      quotaSummary.innerHTML = "";
      quotaSummary.classList.add("hidden");
    }
  }

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
        "プレミアムパックをご利用いただき<strong>ありがとうございます</strong>。全科目を制限なく学習できます。";
    }
    setStartQuotaSummary(
      totalQ > 0
        ? `全 <strong>${totalQ}</strong>問 · プレミアムパック利用中（制限なし）`
        : "プレミアムパック利用中（制限なし）"
    );
    if (paywallNotice) paywallNotice.classList.add("hidden");
    if (planCard) planCard.classList.remove("plan-exhausted");
    if (homeBuySubject) homeBuySubject.classList.add("hidden");
    if (homeBuyPack) homeBuyPack.classList.add("hidden");
    if (billingActions) billingActions.classList.remove("hidden");
    updateBillingManageVisibility();
    updateStartQuotaGate(false);
    return;
  }

  if (freeSubject || hasAccess) {
    if (quotaEl) {
      quotaEl.innerHTML = freeSubject
        ? "この問題集は<strong>無料</strong>です（制限なし）"
        : "この問題集は<strong>購読中</strong>です。ご利用ありがとうございます（制限なし）。";
    }
    if (freeSubject) {
      setStartQuotaSummary(
        totalQ > 0
          ? `全 <strong>${totalQ}</strong>問 · <strong>無料</strong>（制限なし）`
          : "この問題集は<strong>無料</strong>です（制限なし）"
      );
    } else {
      setStartQuotaSummary(
        totalQ > 0
          ? `全 <strong>${totalQ}</strong>問 · 購読中（制限なし）`
          : "購読中（制限なし）"
      );
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
    updateStartQuotaGate(false);
    return;
  }

  if (homeBuySubject) homeBuySubject.classList.remove("hidden");

  const rem = Entitlement.remainingFree(sid);
  if (quotaEl) {
    quotaEl.innerHTML =
      `本日の無料枠: <strong>あと ${rem} / ${Entitlement.FREE_DAILY}問</strong>` +
      `　·　単品 ${escapeHtml(priceLabel)}` +
      (totalQ > 0 ? `　·　全 ${totalQ}問` : "");
  }
  setStartQuotaSummary(
    `本日あと <strong>${rem}</strong> / ${Entitlement.FREE_DAILY}問` +
      (totalQ > 0 ? `　·　全 ${totalQ}問` : "") +
      `　·　単品 ${escapeHtml(priceLabel)}`
  );
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
  updateStartQuotaGate(exhausted, priceLabel);
}

/** 無料枠0か（開始ボタン制御用） */
function isFreeQuotaExhausted() {
  if (!CURRENT_SUBJECT || typeof Entitlement === "undefined") return false;
  if (Entitlement.hasAccess(CURRENT_SUBJECT.id)) return false;
  const priceYen = Entitlement.priceForQuestionCount(
    typeof QUIZ_DATA !== "undefined" ? QUIZ_DATA.length : 0
  );
  if (priceYen <= 0 || Entitlement.isFreeSubject(CURRENT_SUBJECT.id)) return false;
  return Entitlement.remainingFree(CURRENT_SUBJECT.id) <= 0;
}

/**
 * 開始位置の無料枠切れ案内。
 * @param {boolean} exhausted
 * @param {string} [priceLabel]
 */
function updateStartQuotaGate(exhausted, priceLabel) {
  const gate = $("start-quota-gate");
  const textEl = $("start-quota-gate-text");
  const buySubject = $("start-quota-buy-subject-btn");
  const startBtn = $("start-btn");
  if (!gate) return;

  if (!exhausted) {
    gate.classList.add("hidden");
    if (startBtn && typeof updatePoolCount === "function") {
      // pool 側の disabled 判定に任せる
      updatePoolCount();
    } else if (startBtn) {
      startBtn.disabled = false;
    }
    return;
  }

  const label =
    priceLabel ||
    (typeof Entitlement !== "undefined"
      ? Entitlement.formatPrice(
          Entitlement.priceForQuestionCount(
            typeof QUIZ_DATA !== "undefined" ? QUIZ_DATA.length : 0
          )
        )
      : "");
  if (textEl) {
    textEl.textContent =
      `本日の無料枠（${Entitlement.FREE_DAILY}問）を使い切りました。` +
      `単品 ${label}、またはプレミアムパックで続きを学習できます。`;
  }
  if (buySubject) {
    buySubject.textContent = label ? `この問題集を購入（${label}）` : "この問題集を購入";
  }
  gate.classList.remove("hidden");
  if (startBtn) startBtn.disabled = true;
}

/** 開始押下時: alertせず開始位置に案内を出しスクロール */
function showFreeQuotaExhaustedAtStart() {
  let priceLabel = "";
  if (typeof Entitlement !== "undefined" && CURRENT_SUBJECT) {
    priceLabel = Entitlement.formatPrice(
      Entitlement.priceForQuestionCount(
        typeof QUIZ_DATA !== "undefined" ? QUIZ_DATA.length : 0
      )
    );
  }
  updateStartQuotaGate(true, priceLabel);

  const paywallNotice = $("plan-paywall-notice");
  const paywallText = $("plan-paywall-text");
  const planCard = $("home-plan-card");
  if (paywallNotice) paywallNotice.classList.remove("hidden");
  if (planCard) planCard.classList.add("plan-exhausted");
  if (paywallText && typeof Entitlement !== "undefined") {
    paywallText.textContent =
      `本日の無料${Entitlement.FREE_DAILY}問を使い切りました。単品 ${priceLabel}、またはプレミアムパックで続きを学習できます。翌日になると無料枠がリセットされます。`;
  }

  const gate = $("start-quota-gate") || $("start-btn");
  if (gate && typeof gate.scrollIntoView === "function") {
    gate.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const buy = $("start-quota-buy-subject-btn");
  if (buy && typeof buy.focus === "function") {
    window.setTimeout(() => buy.focus(), 280);
  }
}

function goHome() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (!CURRENT_SUBJECT) {
    showScreen("subjects");
    return;
  }
  renderRankBanner("home");
  if (
    typeof ChapterProgress !== "undefined" &&
    ChapterProgress.hasTextbook(CURRENT_SUBJECT)
  ) {
    ChapterProgress.applyTextbookModuleFilter(
      CURRENT_SUBJECT,
      homeChapterSelectedId
    );
  }
  updateHomeNote();
  if (typeof renderModuleChips === "function") renderModuleChips();
  if (typeof updatePoolCount === "function") updatePoolCount();
  showScreen("home");
}
