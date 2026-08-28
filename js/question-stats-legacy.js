/**
 * SAP道場 / 学習道場（問題マスタ・開発側）のみんなの正答率をビジネス道場へ合算
 *
 * マスタ側で溜まった集計を本番へ持ち込む橋渡し。
 * 管理者ログイン後に Cloud Function mergeLegacyQuestionStats を呼ぶ（端末ごと1回の完了フラグあり）。
 */
const QuestionStatsLegacy = (function () {
  const LOCAL_DONE_KEY = "biz_dojo_qs_legacy_merged_v1";
  let inFlight = null;

  function isAdminUser() {
    try {
      const user =
        typeof firebase !== "undefined" &&
        firebase.auth &&
        firebase.auth().currentUser;
      const email = (user && user.email) || "";
      if (
        typeof ADMIN_CONFIG !== "undefined" &&
        ADMIN_CONFIG &&
        ADMIN_CONFIG.email
      ) {
        return email === ADMIN_CONFIG.email;
      }
      return email === "yoshida.hayato0126@gmail.com";
    } catch (e) {
      return false;
    }
  }

  function alreadyDoneLocally() {
    try {
      return localStorage.getItem(LOCAL_DONE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markDoneLocally() {
    try {
      localStorage.setItem(LOCAL_DONE_KEY, "1");
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * @param {{ force?: boolean }} options
   * @returns {Promise<object|null>}
   */
  async function mergeOnce(options = {}) {
    if (!isAdminUser()) {
      return { skipped: true, reason: "not_admin" };
    }
    if (!options.force && alreadyDoneLocally()) {
      return { skipped: true, reason: "local_done" };
    }
    if (
      typeof firebase === "undefined" ||
      !firebase.functions ||
      !firebase.auth ||
      !firebase.auth().currentUser
    ) {
      return { skipped: true, reason: "not_ready" };
    }

    if (!inFlight) {
      inFlight = firebase
        .app()
        .functions("asia-northeast1")
        .httpsCallable("mergeLegacyQuestionStats")({ force: !!options.force })
        .then((res) => {
          const data = res && res.data ? res.data : res;
          // 権限エラー以外はローカル完了扱い（already_merged 含む）
          const hardFail =
            data &&
            Array.isArray(data.errors) &&
            data.errors.length > 0 &&
            data.errors.every((e) => e.reason === "access_denied");
          if (!hardFail) markDoneLocally();
          if (data && data.imported) {
            console.info("みんなの正答率を過去アプリから合算しました", data.results);
          }
          return data;
        })
        .catch((err) => {
          console.warn("みんなの正答率の合算に失敗:", err);
          return { ok: false, reason: "error", message: err.message };
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  return { mergeOnce };
})();
