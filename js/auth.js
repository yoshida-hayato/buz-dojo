/**
 * Firebase Authentication（メール＋パスワード / Googleログイン）
 *
 * FIREBASE_CONFIG が未設定の場合は何もしない（ログインUIを出さず、ブラウザ保存で動く）。
 * ログイン状態が変わると QuizStorage の保存先を切り替え、画面を更新する。
 */

/** 他モジュールからログインモーダルを開く用 */
const AuthUI = {
  _open: null,
  openModal(opts) {
    if (typeof AuthUI._open === "function") {
      AuthUI._open(opts);
      return;
    }
    const btn = document.getElementById("login-btn");
    if (btn) btn.click();
  },
};

(function () {
  function firebaseConfigured() {
    return (
      typeof firebase !== "undefined" &&
      typeof FIREBASE_CONFIG !== "undefined" &&
      FIREBASE_CONFIG.apiKey !== ""
    );
  }

  /** Firebaseのエラーコードを日本語メッセージに変換する */
  const ERROR_MESSAGES = {
    "auth/invalid-email": "メールアドレスの形式が正しくありません。",
    "auth/user-disabled": "このアカウントは無効化されています。",
    "auth/user-not-found": "このメールアドレスのアカウントが見つかりません。「新規登録」をお試しください。",
    "auth/wrong-password": "メールアドレスまたはパスワードが違います。",
    "auth/invalid-credential": "メールアドレスまたはパスワードが違います。",
    "auth/invalid-login-credentials": "メールアドレスまたはパスワードが違います。",
    "auth/email-already-in-use": "このメールアドレスは登録済みです。「ログイン」をお試しください。",
    "auth/weak-password": "パスワードは6文字以上にしてください。",
    "auth/missing-password": "パスワードを入力してください。",
    "auth/too-many-requests": "試行回数が多すぎます。しばらく待ってから再度お試しください。",
    "auth/network-request-failed": "ネットワークエラーです。接続を確認してください。",
    "auth/operation-not-allowed": "この方法でのログインがFirebase側で有効になっていません（Authenticationの設定を確認してください）。",
  };
  function errText(e) {
    const msg = String((e && e.message) || "");
    if (
      (e && e.code === "auth/internal-error" && msg.includes("CONFIGURATION_NOT_FOUND")) ||
      msg.includes("CONFIGURATION_NOT_FOUND")
    ) {
      return (
        "Firebase Authentication がまだ有効になっていません。" +
        " Firebase コンソール → Authentication →「始める」→ メール/パスワードを有効にしてください。" +
        " （https://console.firebase.google.com/project/buz-dojo/authentication ）"
      );
    }
    return ERROR_MESSAGES[e.code] || "エラーが発生しました: " + msg;
  }

  function bootAuth() {
    if (!firebaseConfigured()) return;

    const $ = (id) => document.getElementById(id);
    const loginBtn = $("login-btn");
    const logoutBtn = $("logout-btn");
    const userEl = $("stats-user");
    const modal = $("login-modal");
    const updateModal = $("update-modal");
    const emailInput = $("login-email");
    const passwordInput = $("login-password");
    const messageEl = $("login-message");
    const loginForm = $("login-form");
    const emailLoginBtn = $("email-login-btn");
    const emailRegisterBtn = $("email-register-btn");
    const googleLoginBtn = $("google-login-btn");
    const isMobileLayout = () => window.matchMedia("(max-width: 560px)").matches;

    firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let authBusy = false;
    const BTN_LABELS = {
      login: "ログイン",
      register: "新規登録（上のメールとパスワードで作成）",
      google: "Googleでログイン",
    };

    function setAuthBusy(busy, statusText) {
      authBusy = busy;
      [emailLoginBtn, emailRegisterBtn, googleLoginBtn].forEach((btn) => {
        if (!btn) return;
        btn.disabled = busy;
        btn.classList.toggle("is-loading", busy);
        btn.setAttribute("aria-busy", busy ? "true" : "false");
      });
      if (emailLoginBtn) {
        emailLoginBtn.textContent = busy ? "ログイン中…" : BTN_LABELS.login;
      }
      if (emailRegisterBtn) {
        emailRegisterBtn.textContent = busy ? "登録中…" : BTN_LABELS.register;
      }
      if (googleLoginBtn) {
        googleLoginBtn.textContent = busy ? "Google接続中…" : BTN_LABELS.google;
      }
      if (busy && statusText) showMessage(statusText, true);
    }

    function scrollLoginActionsIntoView() {
      if (!isMobileLayout() || !emailLoginBtn) return;
      window.requestAnimationFrame(() => {
        emailLoginBtn.scrollIntoView({ block: "nearest", behavior: "auto" });
      });
    }

    // --- モーダルの開閉とメッセージ表示 ---
    function openModal(opts) {
      showMessage(null);
      setAuthBusy(false);
      if (updateModal) updateModal.classList.add("hidden");
      modal.classList.remove("hidden");
      document.body.classList.add("login-modal-open");
      if (opts && opts.reason === "checkout") {
        showMessage("購入にはログインが必要です。ログイン後、決済画面へ進みます。");
      }
      if (!isMobileLayout()) {
        window.setTimeout(() => emailInput.focus(), 50);
      }
    }
    AuthUI._open = openModal;
    function closeModal() {
      modal.classList.add("hidden");
      document.body.classList.remove("login-modal-open");
      passwordInput.value = "";
      showMessage(null);
      setAuthBusy(false);
      emailInput.blur();
      passwordInput.blur();
    }
    function showMessage(text, isSuccess) {
      if (!text) {
        messageEl.classList.add("hidden");
        messageEl.classList.remove("is-busy");
        return;
      }
      messageEl.textContent = text;
      messageEl.classList.remove("hidden");
      messageEl.classList.toggle("is-success", !!isSuccess);
      messageEl.classList.toggle("is-busy", !!isSuccess && authBusy);
    }

    loginBtn.classList.remove("hidden");
    loginBtn.addEventListener("click", openModal);
    $("login-modal-close").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
    });

    // --- メール＋パスワード ---
    function emailAndPassword() {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email) {
        showMessage("メールアドレスを入力してください。");
        emailInput.focus();
        return null;
      }
      if (!password) {
        showMessage("パスワードを入力してください。");
        passwordInput.focus();
        return null;
      }
      return { email, password };
    }

    async function doLogin() {
      if (authBusy) return;
      const cred = emailAndPassword();
      if (!cred) return;

      setAuthBusy(true, "ログイン中…");
      emailInput.blur();
      passwordInput.blur();

      try {
        await auth.signInWithEmailAndPassword(cred.email, cred.password);
        showMessage("ログインしました。成績を読み込んでいます…", true);
      } catch (err) {
        setAuthBusy(false);
        showMessage(errText(err));
      }
    }

    async function doRegister() {
      if (authBusy) return;
      const cred = emailAndPassword();
      if (!cred) return;

      setAuthBusy(true, "アカウントを作成しています…");

      try {
        await auth.createUserWithEmailAndPassword(cred.email, cred.password);
        showMessage("登録しました。成績を読み込んでいます…", true);
      } catch (err) {
        setAuthBusy(false);
        showMessage(errText(err));
      }
    }

    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        doLogin();
      });
    }
    if (emailLoginBtn) {
      emailLoginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        doLogin();
      });
    }
    if (emailRegisterBtn) {
      emailRegisterBtn.addEventListener("click", () => doRegister());
    }

    $("password-reset-btn").addEventListener("click", async () => {
      if (authBusy) return;
      const email = emailInput.value.trim();
      if (!email) {
        showMessage("メールアドレスを入力してから押してください。");
        return;
      }
      setAuthBusy(true, "再設定メールを送信中…");
      try {
        await auth.sendPasswordResetEmail(email);
        showMessage("パスワード再設定メールを送信しました。メールを確認してください。", true);
      } catch (err) {
        showMessage(errText(err));
      } finally {
        setAuthBusy(false);
      }
    });

    passwordInput.addEventListener("focus", scrollLoginActionsIntoView);

    // --- Googleログイン ---
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener("click", async () => {
        if (authBusy) return;
        setAuthBusy(true, "Googleに接続しています…");
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
          await auth.signInWithPopup(provider);
          showMessage("ログインしました。成績を読み込んでいます…", true);
        } catch (err) {
          setAuthBusy(false);
          if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
            showMessage(errText(err));
          }
        }
      });
    }

    logoutBtn.addEventListener("click", async () => {
      if (logoutBtn.disabled) return;
      logoutBtn.disabled = true;
      try {
        if (
          typeof QuizStorage !== "undefined" &&
          typeof QuizStorage.prepareLogout === "function"
        ) {
          const ok = await QuizStorage.prepareLogout();
          if (!ok) return;
        }
        await auth.signOut();
      } catch (e) {
        console.warn("ログアウトに失敗:", e);
        alert("ログアウトに失敗しました。通信状況を確認して再度お試しください。");
      } finally {
        logoutBtn.disabled = false;
      }
    });

    auth.onAuthStateChanged(async (user) => {
      if (typeof QuizStorage.invalidateStatsSummariesCache === "function") {
        QuizStorage.invalidateStatsSummariesCache();
      }
      if (user) {
        closeModal();
        await QuizStorage.switchToCloud(user.uid, db);
        try {
          if (typeof AppScripts !== "undefined") {
            await AppScripts.ensureFirebaseFunctions();
            await AppScripts.loadMany([
              "js/legacy-stats-import.js",
              "js/question-stats-legacy.js",
            ]);
          }
          if (typeof LegacyStatsImport !== "undefined") {
            await LegacyStatsImport.runAfterLogin(user);
          } else if (typeof SapLegacyImport !== "undefined") {
            await SapLegacyImport.runAfterLogin(user);
          }
          if (typeof QuestionStatsLegacy !== "undefined") {
            QuestionStatsLegacy.mergeOnce().catch((err) => {
              console.warn("みんなの正答率の合算:", err);
            });
          }
        } catch (err) {
          console.warn("レガシー成績の取り込み準備に失敗:", err);
        }
        if (typeof Entitlement !== "undefined" && Entitlement.startSync) {
          await Entitlement.startSync(user.uid);
        }
        if (typeof QuizStorage !== "undefined" && QuizStorage.updateSyncStatusUi) {
          QuizStorage.updateSyncStatusUi();
        }
        userEl.textContent = "ログイン中のアカウント: " + (user.displayName || user.email || "（名前未設定）");
        userEl.classList.remove("hidden");
        loginBtn.classList.add("hidden");
        logoutBtn.classList.remove("hidden");
        if (typeof Billing !== "undefined" && Billing.resumePendingCheckout) {
          Billing.resumePendingCheckout();
        }
      } else {
        if (typeof Billing !== "undefined" && Billing.clearPendingCheckout) {
          Billing.clearPendingCheckout();
        }
        if (typeof Entitlement !== "undefined" && Entitlement.stopSync) {
          Entitlement.stopSync();
        }
        QuizStorage.switchToLocal();
        if (typeof QuizStorage !== "undefined" && QuizStorage.updateSyncStatusUi) {
          QuizStorage.updateSyncStatusUi();
        }
        userEl.classList.add("hidden");
        loginBtn.classList.remove("hidden");
        logoutBtn.classList.add("hidden");
      }
      setAuthBusy(false);
      if (typeof AppBridge !== "undefined" && AppBridge.notifyAuthUiChanged) {
        AppBridge.notifyAuthUiChanged();
      } else {
        if (typeof updateNavDivider === "function") updateNavDivider();
        if (window.onStatsBackendChanged) window.onStatsBackendChanged();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAuth);
  } else {
    bootAuth();
  }
})();
