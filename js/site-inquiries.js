/**
 * サイト全体への問い合わせ（問題単位の指摘とは別）
 */
const SiteInquiries = (function () {
  const CATEGORY_OPTIONS = [
    { id: "general", label: "全般・ご意見" },
    { id: "bug", label: "不具合・表示の問題" },
    { id: "billing", label: "購入・課金・解約" },
    { id: "content", label: "問題集・学習内容について" },
    { id: "other", label: "その他" },
  ];

  function firebaseReady() {
    return typeof FirebaseApp !== "undefined" ? FirebaseApp.ready() : false;
  }

  function getDb() {
    return typeof FirebaseApp !== "undefined" ? FirebaseApp.getDb() : null;
  }

  function isAvailable() {
    return !!getDb();
  }

  function categoryLabel(id) {
    const hit = CATEGORY_OPTIONS.find((c) => c.id === id);
    return hit ? hit.label : id || "—";
  }

  async function submit(payload) {
    const db = getDb();
    if (!db) throw new Error("Firebase が未設定のため送信できません。");

    const message = String(payload.message || "").trim();
    if (message.length < 5) throw new Error("内容を5文字以上書いてください。");
    if (message.length > 2500) throw new Error("内容は2500文字以内にしてください。");

    const category = String(payload.category || "general");
    const known = CATEGORY_OPTIONS.some((c) => c.id === category);
    const categoryId = known ? category : "other";

    let userEmail = null;
    let userId = null;
    if (firebase.auth && firebase.auth().currentUser) {
      const user = firebase.auth().currentUser;
      userEmail = user.email || null;
      userId = user.uid;
    }

    const doc = {
      category: categoryId,
      categoryLabel: categoryLabel(categoryId),
      message,
      page: String(payload.page || "").slice(0, 120),
      subjectId: String(payload.subjectId || ""),
      subjectTitle: String(payload.subjectTitle || ""),
      appVersion: typeof APP_VERSION !== "undefined" ? APP_VERSION : "",
      userEmail,
      userId,
      status: "open",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("siteInquiries").add(doc);
    return true;
  }

  return {
    CATEGORY_OPTIONS,
    isAvailable,
    submit,
    categoryLabel,
  };
})();
