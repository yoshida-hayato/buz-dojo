/**
 * アプリ用スクリプト／CSS の遅延読込（重複防止・版クエリ付き）
 */
const AppScripts = (function () {
  const scriptCache = new Map();
  const cssCache = new Map();
  const FIREBASE_FUNCTIONS_SDK =
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions-compat.js";

  function version() {
    return typeof APP_VERSION !== "undefined" ? APP_VERSION : String(Date.now());
  }

  function withBust(src) {
    if (/^https?:\/\//i.test(src)) return src;
    return src + (src.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(version());
  }

  function load(src) {
    if (scriptCache.has(src)) return scriptCache.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = withBust(src);
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptCache.delete(src);
        reject(new Error("スクリプト読込失敗: " + src));
      };
      document.head.appendChild(s);
    });
    scriptCache.set(src, p);
    return p;
  }

  function loadMany(srcs) {
    return Promise.all((srcs || []).map(load));
  }

  /** 依存順を保って直列読込 */
  async function loadSequential(srcs) {
    for (const src of srcs || []) {
      await load(src);
    }
  }

  function markLoaded(src) {
    if (!scriptCache.has(src)) scriptCache.set(src, Promise.resolve());
  }

  function markLoadedMany(srcs) {
    (srcs || []).forEach(markLoaded);
  }

  function loadCss(href) {
    if (cssCache.has(href)) return cssCache.get(href);
    const p = new Promise((resolve, reject) => {
      const existing = document.querySelector('link[data-app-css="' + href + '"]');
      if (existing) {
        resolve();
        return;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = withBust(href);
      link.dataset.appCss = href;
      link.onload = () => resolve();
      link.onerror = () => {
        cssCache.delete(href);
        reject(new Error("CSS読込失敗: " + href));
      };
      document.head.appendChild(link);
    });
    cssCache.set(href, p);
    return p;
  }

  function loadCssMany(hrefs) {
    return Promise.all((hrefs || []).map(loadCss));
  }

  function markCssLoaded(href) {
    if (!cssCache.has(href)) cssCache.set(href, Promise.resolve());
  }

  function markCssLoadedMany(hrefs) {
    (hrefs || []).forEach(markCssLoaded);
  }

  async function ensureFirebaseFunctions() {
    if (typeof firebase !== "undefined" && typeof firebase.functions === "function") {
      return;
    }
    await load(FIREBASE_FUNCTIONS_SDK);
  }

  return {
    FIREBASE_FUNCTIONS_SDK,
    load,
    loadMany,
    loadSequential,
    markLoaded,
    markLoadedMany,
    loadCss,
    loadCssMany,
    markCssLoaded,
    markCssLoadedMany,
    withBust,
    ensureFirebaseFunctions,
    version,
  };
})();
