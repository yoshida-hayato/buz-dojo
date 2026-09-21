/** マイページ */

// ===== マイページ =====
let myPageWired = false;
/** マイページ描画の世代（古い非同期結果で上書きしない） */
let _myPageRefreshGen = 0;

function packOnFromEntitlement() {
  return (
    typeof Entitlement !== "undefined" &&
    Entitlement.getEntitlements &&
    Entitlement.getEntitlements().pack === true
  );
}

/** 科目横断: 日別回答を加算合算 */
function mergeDailyAcrossSubjects(dailyMaps) {
  const out = {};
  for (const daily of dailyMaps) {
    if (!daily || typeof daily !== "object") continue;
    for (const [key, v] of Object.entries(daily)) {
      if (!out[key]) out[key] = { a: 0, c: 0 };
      out[key].a += Number(v && v.a) || 0;
      out[key].c += Number(v && v.c) || 0;
    }
  }
  return out;
}

function wireMyPageOnce() {
  if (myPageWired) return;
  myPageWired = true;
  const loginBtn = $("mypage-login-btn");
  if (loginBtn) {
    loginBtn.onclick = () => {
      const headerLogin = $("login-btn");
      if (headerLogin) headerLogin.click();
    };
  }
  const portalBtn = $("mypage-portal-btn");
  if (portalBtn) {
    portalBtn.onclick = () => {
      if (typeof Billing !== "undefined") Billing.openPortal();
    };
  }
}

/** catalog 同期件数（待ちなし）。ピッカーと同型 */
function syncCatalogCountsForMyPage(subjects) {
  if (typeof syncCatalogCountsForPicker === "function") {
    return syncCatalogCountsForPicker(subjects);
  }
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

/**
 * マイページ行。SubjectLoader.loadSubjectSummary は呼ばない
 *（catalog 件数 + 成績サマリだけで足り、subject.js 二重取得を避ける）。
 */
function buildMyPageRows(subjects, catalogCounts, allSummaries, summariesLoaded) {
  return subjects.map((s) => {
    let summary = { questionTotal: 0 };
    let subjectSummary = null;
    let err = false;
    try {
      const total =
        (catalogCounts && Number(catalogCounts[s.id])) ||
        (typeof SubjectCatalog !== "undefined" && SubjectCatalog.getQuestionCountSync
          ? SubjectCatalog.getQuestionCountSync(s.id)
          : 0) ||
        0;
      summary = { questionTotal: total };
      if (summariesLoaded) {
        subjectSummary =
          (allSummaries && allSummaries[s.id]) ||
          (typeof SubjectSummary !== "undefined"
            ? SubjectSummary.empty()
            : { answered: 0, correct: 0, masteredChoice: 0, daily: {} });
      } else if (typeof SubjectSummary !== "undefined") {
        subjectSummary = SubjectSummary.getLocal(s.id);
      } else {
        subjectSummary = { answered: 0, correct: 0, masteredChoice: 0, daily: {} };
      }
      if (typeof QuizStorage !== "undefined" && QuizStorage._displaySummary) {
        subjectSummary = QuizStorage._displaySummary(subjectSummary);
      }
    } catch (e) {
      console.warn("マイページ科目読込失敗:", s.id, e);
      err = true;
    }
    return { s, summary, subjectSummary, err };
  });
}

function paintMyPageBilling(billingEl, rows) {
  if (!billingEl) return;
  const packOn =
    typeof Entitlement !== "undefined" &&
    Entitlement.getEntitlements &&
    Entitlement.getEntitlements().pack === true;
  const packTitle =
    typeof PACK_PLAN !== "undefined" && PACK_PLAN.title
      ? PACK_PLAN.title
      : "プレミアムパック";
  const packPrice =
    typeof PACK_PLAN !== "undefined" && typeof Entitlement !== "undefined"
      ? Entitlement.formatPrice(PACK_PLAN.priceYen)
      : "";

  const billingHint = $("mypage-billing-hint");
  const supportNotice = $("mypage-support-notice");
  const thanksNotice = $("mypage-thanks-notice");
  if (billingHint) {
    billingHint.textContent = packOn
      ? "プレミアムパックをご利用中です。解約・カード変更は契約管理から行えます。"
      : "単品またはプレミアムパックの状態です。購入・解約はここから進められます。プレミアムパックを購入すると、単品の購読は自動で解約されます。";
  }
  if (supportNotice) supportNotice.classList.toggle("hidden", packOn);
  if (thanksNotice) thanksNotice.classList.toggle("hidden", !packOn);

  let html = "";
  html +=
    `<div class="mypage-plan-row${packOn ? " is-active" : ""}">` +
    `<div class="mypage-plan-main">` +
    `<div class="mypage-plan-title">${escapeHtml(packTitle)}</div>` +
    `<div class="mypage-plan-meta">${
      packOn
        ? '<span class="mypage-badge is-on">購読中</span> ご利用ありがとうございます · 全科目が無制限 · メニューから要望提出可'
        : `<span class="mypage-badge is-off">未購読</span> ${escapeHtml(packPrice)}`
    }</div>` +
    `</div>` +
    `<div class="mypage-plan-actions">` +
    (packOn
      ? `<button type="button" class="link-btn mypage-portal-inline">契約管理</button>`
      : `<button type="button" class="primary-btn mypage-buy-pack">プレミアムパックを購入</button>`) +
    `</div></div>`;

  for (const { s, summary, err } of rows) {
    const total = summary ? summary.questionTotal : 0;
    const priceYen =
      typeof Entitlement !== "undefined"
        ? Entitlement.priceForQuestionCount(total)
        : 0;
    const priceLabel =
      typeof Entitlement !== "undefined" ? Entitlement.formatPrice(priceYen) : "";
    const subscribed =
      typeof Entitlement !== "undefined" && Entitlement.hasAccess(s.id);
    const rem =
      !subscribed && typeof Entitlement !== "undefined"
        ? Entitlement.remainingFree(s.id)
        : null;

    let statusHtml;
    if (packOn) {
      statusHtml = `<span class="mypage-badge is-on">プレミアムで利用中</span>`;
    } else if (priceYen <= 0) {
      statusHtml = `<span class="mypage-badge is-on">無料問題集</span>`;
    } else if (subscribed) {
      statusHtml = `<span class="mypage-badge is-on">単品購読中</span>`;
    } else {
      statusHtml =
        `<span class="mypage-badge is-off">無料枠</span>` +
        (rem != null
          ? ` 本日あと <strong>${rem}</strong> / ${Entitlement.FREE_DAILY}問`
          : "");
    }

    html +=
      `<div class="mypage-plan-row${subscribed || packOn || priceYen <= 0 ? " is-active" : ""}">` +
      `<div class="mypage-plan-main">` +
      `<div class="mypage-plan-title">${escapeHtml(s.shortTitle || s.title)}</div>` +
      `<div class="mypage-plan-meta">${statusHtml}` +
      (!subscribed && !packOn && !err && priceYen > 0
        ? ` · 単品 ${escapeHtml(priceLabel)}`
        : "") +
      `</div></div>` +
      `<div class="mypage-plan-actions">`;
    if (packOn) {
      html += `<span class="mypage-plan-note">利用可</span>`;
    } else if (priceYen <= 0) {
      html += `<span class="mypage-plan-note">購入不要</span>`;
    } else if (subscribed) {
      html += `<button type="button" class="link-btn mypage-portal-inline">解約・変更</button>`;
    } else {
      html += `<button type="button" class="secondary-btn mypage-buy-subject" data-subject-id="${escapeHtml(
        s.id
      )}">購入</button>`;
    }
    html += `</div></div>`;
  }

  billingEl.innerHTML = html;
  billingEl.querySelectorAll(".mypage-buy-pack").forEach((btn) => {
    btn.onclick = () => {
      if (typeof Billing !== "undefined") Billing.startCheckout("pack");
    };
  });
  billingEl.querySelectorAll(".mypage-buy-subject").forEach((btn) => {
    btn.onclick = () => {
      const sid = btn.getAttribute("data-subject-id");
      if (sid && typeof Billing !== "undefined") Billing.startCheckout("subject", sid);
    };
  });
  billingEl.querySelectorAll(".mypage-portal-inline").forEach((btn) => {
    btn.onclick = () => {
      if (typeof Billing !== "undefined") Billing.openPortal();
    };
  });
}

function paintMyPageCalendar(calEl, rows) {
  if (!calEl) return;
  const subjectDaily = rows.map((r) => ({
    id: r.s.id,
    title: r.s.shortTitle || r.s.title || r.s.id,
    daily: (r.subjectSummary && r.subjectSummary.daily) || {},
  }));
  const mergedDaily = mergeDailyAcrossSubjects(subjectDaily.map((s) => s.daily));
  if (typeof ActivityCalendar !== "undefined" && ActivityCalendar.render) {
    ActivityCalendar.render(calEl, mergedDaily, { subjects: subjectDaily });
  } else {
    calEl.innerHTML = `<p class="setting-hint">学習履歴カレンダーを読み込めませんでした。</p>`;
  }
}

function paintMyPageStats(statsEl, rows) {
  if (!statsEl) return;
  let html = "";
  let totalAnswered = 0;
  let totalCorrect = 0;

  for (const { s, summary, subjectSummary, err } of rows) {
    if (err || !summary) {
      html +=
        `<div class="mypage-stat-row is-muted">` +
        `<div class="mypage-stat-title">${escapeHtml(s.shortTitle || s.title)}</div>` +
        `<div class="mypage-stat-body">成績を読み込めませんでした</div></div>`;
      continue;
    }
    const stats = subjectSummary || { answered: 0, correct: 0, masteredChoice: 0 };
    const answered = Number(stats.answered) || 0;
    const correct = Number(stats.correct) || 0;
    const mastered = Number(stats.masteredChoice) || 0;
    const hasProgress = answered > 0 || mastered > 0;
    const total = summary.questionTotal || 0;
    // ピッカー同様: 保存 rankName ではなく catalog＋成績から再計算
    let rank = null;
    if (
      hasProgress &&
      typeof getRankForContext === "function" &&
      typeof createPickerRankContext === "function"
    ) {
      rank = getRankForContext(stats, createPickerRankContext(total, s.id));
      if (rank && typeof SubjectSummary !== "undefined") {
        const snapped = SubjectSummary.normalize({
          ...stats,
          rankName: rank.name || "",
          rankAlias: rank.alias || "",
          rankColor: rank.color || "",
          rankFg: rank.fg || "",
        });
        SubjectSummary.setLocal(s.id, snapped);
      }
    } else if (hasProgress && typeof SubjectSummary !== "undefined") {
      rank = SubjectSummary.rankFrom(stats);
    }
    const masteredPct = total === 0 ? 0 : Math.round((mastered / total) * 100);
    // 正答率は累計正解÷累計回答（choiceAccPct＝直近窓は使わない）
    const allTimePct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    totalAnswered += answered;
    totalCorrect += correct;

    const accent = s.accent || "var(--sap-blue)";
    const hasPlay = mastered > 0 || answered > 0;
    // 第7回採択: 絶対数を主（N/M）、%は従。計算式は非接触
    let masteryNum = String(mastered);
    let masteryLbl = `習得 ${masteredPct}% · 全${total}`;
    if (typeof MasteryDisplay !== "undefined" && total > 0) {
      masteryNum = `${mastered}/${total}`;
      masteryLbl = `習得 · ${masteredPct}%`;
    }
    let denomNoteRow = "";
    if (typeof MasteryDisplay !== "undefined" && hasPlay) {
      const note = MasteryDisplay.denomGrowthNote(s.id, total, true);
      if (note) {
        denomNoteRow = `<p class="mypage-denom-note">${escapeHtml(note)}</p>`;
      }
    }
    html +=
      `<div class="mypage-stat-row" style="--mypage-accent:${accent}">` +
      `<div class="mypage-stat-head">` +
      `<div class="mypage-stat-title">${escapeHtml(s.shortTitle || s.title)}</div>` +
      (rank
        ? `<span class="mypage-rank-badge" style="background:${rank.color};color:${rank.fg}">${escapeHtml(
            rank.name
          )}</span>`
        : "") +
      `</div>` +
      `<div class="mypage-stat-alias">${rank ? escapeHtml(rank.alias) : hasProgress ? "" : "未プレイ"}</div>` +
      `<div class="mypage-stat-grid">` +
      `<div><span class="mypage-stat-num">${answered}</span><span class="mypage-stat-lbl">回答</span></div>` +
      `<div><span class="mypage-stat-num">${allTimePct}%</span><span class="mypage-stat-lbl">正答率</span></div>` +
      `<div><span class="mypage-stat-num">${escapeHtml(masteryNum)}</span><span class="mypage-stat-lbl">${escapeHtml(masteryLbl)}</span></div>` +
      `</div>` +
      denomNoteRow +
      `<div class="mypage-stat-actions">` +
      `<button type="button" class="link-btn mypage-open-subject" data-subject-id="${escapeHtml(
        s.id
      )}">この科目で学習</button>` +
      `</div></div>`;
  }

  const overallPct =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const summaryBar =
    `<div class="mypage-overall">` +
    `<strong>全科目合計</strong>` +
    `<div class="mypage-overall-metrics">` +
    `<span>回答 ${totalAnswered}</span>` +
    `<span>正解 ${totalCorrect}</span>` +
    `<span>正答率 ${overallPct}%</span>` +
    `</div></div>`;

  statsEl.innerHTML = summaryBar + html;
  statsEl.querySelectorAll(".mypage-open-subject").forEach((btn) => {
    btn.onclick = () => {
      const sid = btn.getAttribute("data-subject-id");
      if (sid) {
        activateSubject(sid, { afterLoadScreen: "home" }).catch((e) =>
          alert(e.message || "科目の読み込みに失敗しました")
        );
      }
    };
  });
}

function paintMyPagePanels(billingEl, calEl, statsEl, rows) {
  paintMyPageBilling(billingEl, rows);
  if (typeof updatePremiumNavLock === "function") updatePremiumNavLock();
  paintMyPageCalendar(calEl, rows);
  paintMyPageStats(statsEl, rows);
}

async function renderMyPage() {
  wireMyPageOnce();
  const accountEl = $("mypage-account");
  const billingEl = $("mypage-billing");
  const statsEl = $("mypage-stats");
  const calEl = $("mypage-activity-cal");
  const loginBtn = $("mypage-login-btn");
  const portalBtn = $("mypage-portal-btn");

  const user =
    typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser;

  if (accountEl) {
    if (user) {
      accountEl.textContent =
        "ログイン中: " + (user.displayName || user.email || "（名前未設定）");
    } else {
      accountEl.textContent =
        "未ログインです。ログインすると成績のクラウド保存と購入が利用できます。";
    }
  }
  if (loginBtn) loginBtn.classList.toggle("hidden", !!user);

  const hasSub =
    typeof Entitlement !== "undefined" &&
    Entitlement.hasAnySubscription &&
    Entitlement.hasAnySubscription();
  if (portalBtn) portalBtn.classList.toggle("hidden", !user || !hasSub);

  if (typeof QuizStorage !== "undefined" && typeof QuizStorage.invalidateStatsSummariesCache === "function") {
    QuizStorage.invalidateStatsSummariesCache();
  }

  if (
    user &&
    typeof QuizStorage !== "undefined" &&
    typeof QuizStorage.syncAllSubjectsToCloudIfNeeded === "function"
  ) {
    // 表示をブロックしない（前回の重い同期が読込遅延の主因）
    void QuizStorage.syncAllSubjectsToCloudIfNeeded()
      .then((pushed) => {
        if (pushed && typeof QuizStorage.invalidateStatsSummariesCache === "function") {
          QuizStorage.invalidateStatsSummariesCache();
        }
      })
      .catch((e) => console.warn("全科目クラウド同期に失敗:", e));
  }

  const subjects =
    typeof SUBJECT_REGISTRY !== "undefined" ? SUBJECT_REGISTRY.filter((s) => s.enabled) : [];
  const gen = ++_myPageRefreshGen;

  // A: 同期 catalog + local/メモリサマリで即描画（「成績を読み込み中…」全消しをやめる）
  const syncCounts = syncCatalogCountsForMyPage(subjects);
  const localMap =
    typeof SubjectSummary !== "undefined" ? SubjectSummary.readLocalMap() : {};
  const memCache =
    typeof QuizStorage !== "undefined" && QuizStorage._allSummariesCache
      ? QuizStorage._allSummariesCache
      : null;
  const localRows = buildMyPageRows(
    subjects,
    syncCounts,
    memCache || localMap || {},
    !!memCache
  );
  paintMyPagePanels(billingEl, calEl, statsEl, localRows);

  // バックグラウンドで catalog + 全科目サマリを更新
  try {
    const [catalogCounts, allSummaries] = await Promise.all([
      typeof SubjectCatalog !== "undefined"
        ? SubjectCatalog.loadAll()
        : Promise.resolve(syncCounts),
      typeof QuizStorage.loadAllSubjectSummaries === "function"
        ? QuizStorage.loadAllSubjectSummaries()
        : typeof QuizStorage.loadAllStatsSummaries === "function"
          ? QuizStorage.loadAllStatsSummaries()
          : Promise.resolve(localMap || {}),
    ]);
    if (gen !== _myPageRefreshGen) return;

    const summariesLoaded =
      allSummaries && typeof allSummaries === "object" && !Array.isArray(allSummaries);
    const rows = buildMyPageRows(
      subjects,
      catalogCounts || syncCounts,
      allSummaries,
      !!summariesLoaded
    );
    paintMyPagePanels(billingEl, calEl, statsEl, rows);
  } catch (e) {
    console.warn("マイページ更新に失敗:", e);
  }
}
