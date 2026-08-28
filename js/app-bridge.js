/**
 * 画面間の疎結合ブリッジ（auth ↔ ナビ等の window 相互依存を集約）
 */
const AppBridge = (function () {
  function notifyAuthUiChanged() {
    if (typeof updateNavDivider === "function") updateNavDivider();
    if (typeof window.onStatsBackendChanged === "function") {
      window.onStatsBackendChanged();
    }
  }

  function notifyEntitlementsChanged(data) {
    if (typeof window.onEntitlementsChanged === "function") {
      window.onEntitlementsChanged(data);
    }
  }

  return {
    notifyAuthUiChanged,
    notifyEntitlementsChanged,
  };
})();
