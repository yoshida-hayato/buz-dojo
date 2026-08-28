/** ナビ配線・更新通知・ハンバーガー・changelog */

let appChromeWired = false;

function openMyPageScreen() {
  location.hash = "mypage";
  showScreen("mypage");
  ensureMypage()
    .then(() => renderMyPage())
    .catch((e) => console.warn(e));
}

function openContactScreen() {
  location.hash = "contact";
  ensureAppScripts(["js/screens-contact.js"])
    .then(() => ensureSiteInquiries())
    .then(() => showContactScreen())
    .catch((e) => console.warn(e));
}

function openPremiumRequestScreen() {
  ensurePremiumDesk()
    .then(() => openPremiumScreen())
    .then((ok) => {
      if (ok) return;
      if (!CURRENT_SUBJECT) showScreen("subjects");
      else goHome();
    })
    .catch((e) => console.warn(e));
}

function openStatsScreen() {
  location.hash = "stats";
  showScreen("stats");
  ensureStatsScreen()
    .then(() => renderStats())
    .catch((e) => console.warn(e));
}

function wireAppChromeOnce() {
  if (appChromeWired) return;
  appChromeWired = true;

  $("start-btn").addEventListener("click", () => {
    if (typeof startQuiz !== "function" || typeof getSettings !== "function") {
      alert("出題モジュールを読み込み中です。少し待ってから再度お試しください。");
      return;
    }
    startQuiz(getSettings());
  });
  $("next-btn").addEventListener("click", () => {
    if (typeof nextQuestion === "function") nextQuestion();
  });
  $("quit-btn").addEventListener("click", () => {
    if (confirm("クイズを中断してホームへ戻りますか？（回答済みの成績は保存されています）")) {
      goHome();
    }
  });
  $("retry-btn").addEventListener("click", () => {
    if (typeof startQuiz !== "function" || !quiz) return;
    const avoidIds = quiz.questions.map((q) => q.entry.id);
    startQuiz(quiz.settings, { avoidIds });
  });
  $("result-home-btn").addEventListener("click", goHome);
  $("stats-review-quiz-btn").addEventListener("click", () => {
    ensureStatsScreen()
      .then(() => {
        if (typeof startReviewQuiz === "function") startReviewQuiz();
      })
      .catch((e) => console.warn(e));
  });

  $("site-title").addEventListener("click", goHome);
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nav = btn.dataset.nav;
      if (!nav) return;
      const siteNav = $("site-nav");
      const ham = $("hamburger-btn");
      if (siteNav) siteNav.classList.remove("nav-open");
      if (ham) {
        ham.classList.remove("open");
        ham.setAttribute("aria-expanded", "false");
      }
      if (nav === "home") {
        goHome();
        return;
      }
      if (nav === "subjects") {
        openSubjectPicker();
        return;
      }
      if (nav === "mypage") {
        openMyPageScreen();
        return;
      }
      if (nav === "premium") {
        if (btn.classList.contains("is-locked") || btn.getAttribute("aria-disabled") === "true") {
          return;
        }
        openPremiumRequestScreen();
        return;
      }
      if (nav === "contact") {
        openContactScreen();
        return;
      }
      if (!CURRENT_SUBJECT) {
        showScreen("subjects");
        return;
      }
      if (nav === "stats") {
        openStatsScreen();
      } else if (nav === "tcodes") {
        location.hash = "tcodes";
        showScreen("tcodes");
        ensureSubjectBrowsers(CURRENT_SUBJECT).then(() => {
          if (typeof TcodeBrowser !== "undefined") TcodeBrowser.show();
        });
      } else if (nav === "syntax") {
        location.hash = "syntax";
        showScreen("syntax");
        ensureSubjectBrowsers(CURRENT_SUBJECT).then(() => {
          if (typeof SyntaxBrowser !== "undefined") SyntaxBrowser.show();
        });
      } else if (nav === "shortcuts") {
        location.hash = "shortcuts";
        ensureSubjectBrowsers(CURRENT_SUBJECT).then(() => {
          if (typeof ShortcutBrowser !== "undefined") ShortcutBrowser.show();
          showScreen("shortcuts");
        });
      }
    });
  });

  // 記述式: 回答ボタンと入力欄のEnterで回答確定
  $("answer-submit-btn").addEventListener("click", () => {
    if (typeof answerTyped === "function") answerTyped();
  });
  $("judgment-submit-btn").addEventListener("click", () => {
    if (typeof answerJudgmentMulti === "function") answerJudgmentMulti();
  });
  $("answer-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("answer-input").disabled) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof answerTyped === "function") answerTyped();
    }
  });

  // キーボード操作: A-H / 1-6 で回答。
  // フィードバック後の Enter→次へは、scheduleNextBtnFocus でフォーカスした
  // 「次へ」ボタンの標準動作に任せる（ここで nextQuestion すると回答用 Enter と衝突し解説が飛ぶ）。
  document.addEventListener("keydown", (e) => {
    if ($("screen-quiz").classList.contains("hidden")) return;
    const feedbackVisible = !$("feedback-card").classList.contains("hidden");
    if (feedbackVisible) return;
    if (e.target === $("answer-input")) return; // 記述式の入力中はショートカット無効
    const q = quiz.questions[quiz.idx];
    if (q?.isJudgmentMulti && e.key === "Enter") {
      if (!$("judgment-submit-btn").disabled) answerJudgmentMulti();
      return;
    }
    let idx = -1;
    const upper = e.key.toUpperCase();
    if (CHOICE_KEYS.includes(upper)) idx = CHOICE_KEYS.indexOf(upper);
    if (/^[1-6]$/.test(e.key)) idx = Number(e.key) - 1;
    if (idx >= 0) {
      const btn = $("choices").querySelectorAll(".choice-btn")[idx];
      if (btn && !btn.disabled) btn.click();
    }
  });
}

// ===== 更新履歴（ヘッダーの通知ベル） =====
const CHANGELOG_SEEN_KEY = "biz_dojo_changelog_seen";
const APP_VERSION_KEY = "biz_dojo_app_version";
const APP_RELOAD_TARGET_KEY = "biz_dojo_reload_target";
let appUpdateGatePassed = false;

/** スマホなどタッチ端末かどうか（更新ポップアップの表示対象） */
function isMobileDevice() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024)
  );
}

/** サーバー上の APP_VERSION を取得する */
async function fetchServerAppVersion() {
  try {
    const res = await fetch(`config/version.js?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/APP_VERSION\s*=\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

/** Service Worker と Cache Storage を可能な限り削除 */
async function clearAppCaches() {
  if ("serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch (_) { /* 非対応 */ }
  }
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* 非対応 */ }
  }
}

/** 最新版を読み込む（localStorage のバージョンは読み込み成功後に更新する） */
async function forceAppReloadWithVersion(targetVersion) {
  sessionStorage.setItem(APP_RELOAD_TARGET_KEY, targetVersion);
  await clearAppCaches();
  const bust = Date.now();
  const base = window.location.origin + window.location.pathname;
  window.location.assign(`${base}?v=${encodeURIComponent(targetVersion)}&_=${bust}`);
}

/** 更新ポップアップの内容をセット */
function showUpdateModal(targetVersion, options = {}) {
  const modal = $("update-modal");
  const changelogBox = $("update-modal-changelog");
  const errorEl = $("update-modal-error");

  if (typeof CHANGELOG !== "undefined" && CHANGELOG.length > 0) {
    const latest = CHANGELOG[0];
    const d = new Date(latest.date + "T00:00:00");
    changelogBox.innerHTML =
      `<div class="uc-date">${d.getMonth() + 1}/${d.getDate()} 更新</div>` +
      `<span class="uc-count">+${latest.added}問</span>` +
      `<div>${escapeHtml(latest.note)}</div>`;
    changelogBox.classList.remove("hidden");
  } else {
    changelogBox.classList.add("hidden");
  }

  if (options.stale) {
    errorEl.textContent = "まだ古いバージョンが残っています。もう一度ボタンを押してください。";
    errorEl.classList.remove("hidden");
  } else {
    errorEl.classList.add("hidden");
  }

  modal.classList.remove("hidden");

  const btn = $("update-reload-btn");
  const skipBtn = $("update-skip-btn");
  btn.disabled = false;
  btn.classList.remove("is-loading");
  btn.querySelector(".update-reload-label").textContent = "最新版を読み込む";

  btn.onclick = async () => {
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.querySelector(".update-reload-label").textContent = "読み込み中";
    await forceAppReloadWithVersion(targetVersion);
  };

  if (skipBtn) {
    skipBtn.onclick = () => {
      modal.classList.add("hidden");
      if (targetVersion) localStorage.setItem(APP_VERSION_KEY, targetVersion);
      if (typeof options.onSkip === "function") options.onSkip();
    };
  }
}

/** リロード後の URL パラメータを掃除し、更新完了として記録する */
function markAppUpdateComplete(version) {
  if (version) localStorage.setItem(APP_VERSION_KEY, version);
  sessionStorage.removeItem(APP_RELOAD_TARGET_KEY);
  if (window.history.replaceState) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  $("update-modal").classList.add("hidden");
}

/**
 * 問題データ読込の前にアプリ版を確認する。
 * 更新が必要ならポップアップを出し、「スキップ」まで待つ（「最新版を読み込む」はページ遷移）。
 */
async function ensureAppUpdateBeforeLoad() {
  if (appUpdateGatePassed) return;

  if (!isMobileDevice()) {
    appUpdateGatePassed = true;
    return;
  }

  const modal = $("update-modal");
  const serverVersion = await fetchServerAppVersion();
  const bundledVersion = typeof APP_VERSION !== "undefined" ? APP_VERSION : null;
  const version = serverVersion || bundledVersion;

  if (!version) {
    modal.classList.add("hidden");
    appUpdateGatePassed = true;
    return;
  }

  const stored = localStorage.getItem(APP_VERSION_KEY);
  const reloadTarget = sessionStorage.getItem(APP_RELOAD_TARGET_KEY);

  // リロード直後: iOS が version.js を握ると bundled≠server のままになりやすい。
  // 「まだ古い」を繰り返し出すと無限ループになるので、1回試したら完了扱いする。
  if (reloadTarget) {
    markAppUpdateComplete(serverVersion || reloadTarget || bundledVersion);
    appUpdateGatePassed = true;
    return;
  }

  // 初回訪問は記録だけ（ポップアップなし）
  if (!stored) {
    localStorage.setItem(APP_VERSION_KEY, version);
    modal.classList.add("hidden");
    appUpdateGatePassed = true;
    return;
  }

  const onServerLatest = !!(serverVersion && bundledVersion && bundledVersion === serverVersion);

  // 既に最新
  if (stored === version && (!serverVersion || onServerLatest || !bundledVersion)) {
    modal.classList.add("hidden");
    appUpdateGatePassed = true;
    return;
  }

  // 保存版より新しいサーバ版がある、またはバンドルがサーバより古い
  if (stored !== version || (serverVersion && bundledVersion && bundledVersion !== serverVersion)) {
    await new Promise((resolve) => {
      showUpdateModal(serverVersion || version, { onSkip: resolve });
    });
    appUpdateGatePassed = true;
    return;
  }

  modal.classList.add("hidden");
  appUpdateGatePassed = true;
}

/** バージョンが変わっていたらスマホに更新ポップアップを出す（後方互換） */
async function initAppUpdatePrompt() {
  return ensureAppUpdateBeforeLoad();
}

/** ハンバーガーメニューのトグル */
function initHamburgerMenu() {
  const btn = $("hamburger-btn");
  const nav = $("site-nav");
  const header = document.querySelector(".site-header");
  if (!btn || !nav) return;

  const updateHeaderHeight = () => {
    if (header) {
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
    }
  };
  updateHeaderHeight();
  window.addEventListener("resize", updateHeaderHeight);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = nav.classList.toggle("nav-open");
    btn.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && e.target !== btn) {
      nav.classList.remove("nav-open");
      btn.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  });
  nav.addEventListener("click", (e) => {
    if (e.target.classList.contains("nav-btn")) {
      nav.classList.remove("nav-open");
      btn.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  });
}

let changelogBellWired = false;

/** ベルパネルに更新履歴（科目 changelog.js の CHANGELOG）を描画し、未読ドットを制御する */
function initChangelogBell() {
  const bell = $("bell-btn");
  const panel = $("bell-panel");
  const dot = $("bell-dot");
  const entries =
    typeof CHANGELOG !== "undefined"
      ? CHANGELOG.filter((c) => c.added > 0)
      : [];
  if (entries.length === 0) {
    if (bell) {
      bell.classList.add("hidden");
      bell.dataset.hasChangelog = "0";
    }
    return;
  }
  if (bell) {
    bell.dataset.hasChangelog = "1";
    const subjectsVisible =
      $("screen-subjects") && !$("screen-subjects").classList.contains("hidden");
    bell.classList.toggle("hidden", subjectsVisible);
  }

  const listBox = $("changelog-list");
  listBox.innerHTML = "";
  entries.forEach((c) => {
    const d = new Date(c.date + "T00:00:00");
    const row = document.createElement("div");
    row.className = "changelog-row";
    row.innerHTML =
      `<div class="cl-meta">` +
      `<span class="cl-date">${d.getMonth() + 1}/${d.getDate()}</span>` +
      `<span class="cl-count">+${c.added}問</span>` +
      `</div>` +
      `<span class="cl-note">${escapeHtml(c.note)}</span>`;
    listBox.appendChild(row);
  });

  const latestDate = entries[0].date;
  if (localStorage.getItem(CHANGELOG_SEEN_KEY) !== latestDate) dot.classList.remove("hidden");
  else dot.classList.add("hidden");

  if (changelogBellWired) return;
  changelogBellWired = true;

  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      const seenDate =
        typeof CHANGELOG !== "undefined"
          ? (CHANGELOG.find((c) => c.added > 0) || CHANGELOG[0]).date
          : null;
      if (seenDate) {
        localStorage.setItem(CHANGELOG_SEEN_KEY, seenDate);
        dot.classList.add("hidden");
      }
    }
  });
  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== bell) {
      panel.classList.add("hidden");
    }
  });
}
