/**
 * Firebase 初期化の共有（問い合わせ・指摘などで重複しないようにする）
 */
const FirebaseApp = (function () {
  function ready() {
    return (
      typeof firebase !== "undefined" &&
      typeof FIREBASE_CONFIG !== "undefined" &&
      FIREBASE_CONFIG.apiKey
    );
  }

  function ensureApp() {
    if (!ready()) return null;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.app();
  }

  function getDb() {
    if (!ensureApp()) return null;
    return firebase.firestore();
  }

  function getAuth() {
    if (!ensureApp()) return null;
    return firebase.auth();
  }

  return { ready, ensureApp, getDb, getAuth };
})();
