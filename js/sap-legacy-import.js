/**
 * 互換シム — 本体は js/legacy-stats-import.js
 * （旧パス参照が残っていても動くようにする）
 */
(function () {
  if (typeof LegacyStatsImport !== "undefined") {
    window.SapLegacyImport = LegacyStatsImport;
    return;
  }
  const s = document.createElement("script");
  const v = typeof APP_VERSION !== "undefined" ? APP_VERSION : String(Date.now());
  s.src = "js/legacy-stats-import.js?v=" + encodeURIComponent(v);
  s.async = false;
  document.head.appendChild(s);
})();
