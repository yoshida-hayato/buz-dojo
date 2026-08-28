/** 画面切替・ヘッダークローム */

// ===== 画面切替 =====
function updateHeaderChrome(screenName) {
  const onSubjects = screenName === "subjects";
  const onMyPage = screenName === "mypage";
  const onContact = screenName === "contact";
  const onPremium = screenName === "premium";
  const chromeLite = onSubjects || onMyPage || onContact || onPremium;
  document.body.classList.toggle("subjects-screen-active", onSubjects);
  document.body.classList.toggle("premium-screen-active", onPremium);

  const navHome = $("nav-home") || document.querySelector('.nav-btn[data-nav="home"]');
  const navStats = $("nav-stats");
  const navMyPage = $("nav-mypage");
  const navChangeSubject = $("nav-change-subject");
  if (navHome) navHome.classList.toggle("hidden", chromeLite);
  // 成績は科目選択中などでは隠す（科目未選択では意味が薄い）
  if (navStats) navStats.classList.toggle("hidden", chromeLite || !CURRENT_SUBJECT);
  // マイページは常時アイコン表示（科目選択からも開ける）
  if (navMyPage) navMyPage.classList.remove("hidden");
  if (navChangeSubject) navChangeSubject.classList.toggle("hidden", onSubjects || !CURRENT_SUBJECT);

  const bell = $("bell-btn");
  const bellPanel = $("bell-panel");
  const hasChangelog = bell && bell.dataset.hasChangelog === "1";
  if (bell) bell.classList.toggle("hidden", chromeLite || !hasChangelog);
  if (bellPanel && chromeLite) bellPanel.classList.add("hidden");

  updateNavDivider();
}

function updateNavDivider() {
  const divider = $("nav-divider");
  if (!divider) return;
  const utilIds = ["nav-premium", "nav-contact", "nav-change-subject", "logout-btn"];
  const show = utilIds.some((id) => {
    const el = $(id);
    return el && !el.classList.contains("hidden");
  });
  divider.classList.toggle("hidden", !show);
}

function showScreen(name) {
  ["subjects", "home", "quiz", "result", "stats", "mypage", "premium", "contact", "tcodes", "syntax", "shortcuts"].forEach((s) => {
    const el = $("screen-" + s);
    if (el) el.classList.toggle("hidden", s !== name);
  });
  document.querySelectorAll("[data-nav]").forEach((b) => {
    if (!b.dataset.nav) return;
    b.classList.toggle("active", b.dataset.nav === name);
  });
  updateHeaderChrome(name);
  window.scrollTo(0, 0);
}
