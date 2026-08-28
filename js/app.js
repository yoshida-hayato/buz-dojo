

/* =====================================================================
 * ビジネス道場 — ブートストラップ
 * 共有状態・各画面モジュールを読み込んだうえで起動する
 * ===================================================================== */

/** 機能別スクリプトの遅延読込 */
async function ensureAppScripts(paths) {
  if (typeof AppScripts === "undefined") return;
  await AppScripts.loadMany(paths);
}

async function ensureQuestionStats() {
  await ensureAppScripts(["js/question-stats.js"]);
}

async function ensureStatsModules() {
  await ensureAppScripts(["js/stats-analysis.js", "js/activity-calendar.js"]);
}

async function ensureLegacyImportLocal() {
  await ensureAppScripts(["js/legacy-stats-import.js"]);
}

async function ensureCss(paths) {
  if (typeof AppScripts === "undefined" || !AppScripts.loadCssMany) return;
  await AppScripts.loadCssMany(paths);
}

async function ensureQuizModules() {
  await ensureCss(["css/rank.css", "css/quiz.css"]);
  await ensureAppScripts([
    "js/settings-ui.js",
    "js/quiz-builder.js",
    "js/quiz-engine.js",
    "js/screens-result.js",
    "js/firebase-app-util.js",
    "js/screens-contact.js",
  ]);
}

async function ensureSubjectBrowsers(subject) {
  const features = (subject && subject.features) || {};
  if (
    subject &&
    subject.id &&
    typeof SubjectLoader !== "undefined" &&
    SubjectLoader.loadExtraScripts
  ) {
    try {
      await SubjectLoader.loadExtraScripts(subject.id);
    } catch (e) {
      console.warn("科目追加データの読込に失敗:", e);
    }
  }
  const paths = [];
  if (features.tcodeBrowser) paths.push("js/tcode-browser.js");
  if (features.syntaxBrowser) paths.push("js/syntax-browser.js");
  const hasShortcuts =
    typeof QUIZ_DATA !== "undefined" &&
    QUIZ_DATA.some((q) => q && q.category === "shortcut");
  if (hasShortcuts) paths.push("js/shortcut-browser.js");
  if (paths.length) {
    await ensureCss(["css/browsers.css"]);
    await ensureAppScripts(paths);
  }
}

async function ensureMypage() {
  await ensureCss(["css/mypage.css", "css/stats.css"]);
  await ensureAppScripts([
    "js/firebase-app-util.js",
    "js/activity-calendar.js",
    "js/screens-mypage.js",
  ]);
}

async function ensurePremiumDesk() {
  await ensureCss(["css/premium.css"]);
  await ensureAppScripts([
    "js/firebase-app-util.js",
    "js/premium-requests.js",
    "js/screens-premium.js",
  ]);
  if (typeof updatePremiumNavLock === "function") updatePremiumNavLock();
}

async function ensureStatsScreen() {
  await ensureCss(["css/rank.css", "css/stats.css"]);
  await ensureAppScripts(["js/screens-stats.js"]);
  await ensureStatsModules();
}

async function ensureQuestionReports() {
  await ensureAppScripts([
    "js/firebase-app-util.js",
    "js/screens-contact.js",
    "js/question-reports.js",
  ]);
  if (!window.__questionReportsInited) {
    window.__questionReportsInited = true;
    initQuestionReports();
  }
}

async function ensureSiteInquiries() {
  await ensureAppScripts([
    "js/firebase-app-util.js",
    "js/screens-contact.js",
    "js/site-inquiries.js",
  ]);
  if (!window.__contactFormInited) {
    window.__contactFormInited = true;
    initContactForm();
  }
}

// ===== 初期化 =====
async function bootApp() {
  QuizStorage.init();
  initBillingUI();
  initHamburgerMenu();
  wireAppChromeOnce();
  if (typeof ensureAppUpdateBeforeLoad === "function") {
    try {
      await ensureAppUpdateBeforeLoad();
    } catch (e) {
      console.warn("更新チェック:", e);
    }
  }

  // 科目未選択時は Tコード/構文ナビを隠す
  const navTcodes = document.querySelector('.nav-btn[data-nav="tcodes"]');
  const navSyntax = document.querySelector('.nav-btn[data-nav="syntax"]');
  if (navTcodes) navTcodes.classList.add("hidden");
  if (navSyntax) navSyntax.classList.add("hidden");

  // 未知パス（/foo など）は科目一覧へ
  if (
    typeof SubjectLoader !== "undefined" &&
    SubjectLoader.getUnknownPathSegment &&
    SubjectLoader.getUnknownPathSegment()
  ) {
    if (SubjectLoader.syncUrlForPicker) SubjectLoader.syncUrlForPicker();
  }

  const selected =
    typeof SubjectLoader !== "undefined" && SubjectLoader.resolveBootSubjectId
      ? SubjectLoader.resolveBootSubjectId()
      : typeof SubjectLoader !== "undefined"
        ? SubjectLoader.getSelected()
        : null;

  if (!selected) {
    initSubjectPicker();
    document.documentElement.classList.remove("boot-resume-subject");
    ensurePremiumDesk().catch(() => {});
    if (location.hash === "#mypage") {
      openMyPageScreen();
      return;
    }
    if (location.hash === "#premium") {
      openPremiumRequestScreen();
      return;
    }
    if (location.hash === "#contact") {
      openContactScreen();
      return;
    }
    showScreen("subjects");
    return;
  }

  // 科目再開: ピッカーを挟まずローディング→ホーム（または hash 画面）
  ensurePremiumDesk().catch(() => {});
  const subjectsScreen = $("screen-subjects");
  if (subjectsScreen) subjectsScreen.classList.add("hidden");
  const meta =
    typeof SUBJECT_REGISTRY !== "undefined"
      ? SUBJECT_REGISTRY.find((s) => s.id === selected)
      : null;
  if (typeof showSubjectLoading === "function") {
    showSubjectLoading(meta ? meta.title || meta.shortTitle : "");
  }

  activateSubject(selected)
    .catch((e) => {
      console.error(e);
      if (typeof SubjectLoader !== "undefined") {
        SubjectLoader.clearSelected();
        if (SubjectLoader.syncUrlForPicker) SubjectLoader.syncUrlForPicker();
      }
      initSubjectPicker();
      showScreen("subjects");
    })
    .finally(() => {
      document.documentElement.classList.remove("boot-resume-subject");
    });
}


if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bootApp().catch((e) => console.error(e));
  });
} else {
  bootApp().catch((e) => console.error(e));
}

/** ログイン/ログアウトで保存先が切り替わったとき、表示中の画面を最新の成績で描き直す */
window.onStatsBackendChanged = function () {
  const subjectsScreen = $("screen-subjects");
  if (subjectsScreen && !subjectsScreen.classList.contains("hidden")) {
    refreshSubjectPickerCards();
  }
  if (!$("screen-home").classList.contains("hidden")) {
    renderRankBanner("home");
    updateHomeNote();
    if (typeof renderModuleChips === "function") renderModuleChips();
    if (typeof updatePoolCount === "function") updatePoolCount();
  }
  if (!$("screen-stats").classList.contains("hidden") && typeof renderStats === "function") {
    renderStats();
  }
  if ($("screen-mypage") && !$("screen-mypage").classList.contains("hidden") && typeof renderMyPage === "function") {
    renderMyPage();
  }
};
