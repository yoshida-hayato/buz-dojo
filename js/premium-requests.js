/**
 * プレミアムパック会員向けの要望・問題追加たたき台の提出
 */
const PremiumRequests = (function () {
  const TYPE_OPTIONS = [
    {
      id: "feature",
      label: "機能要望",
      hint: "追加してほしい機能や改善案。優先的に確認します。",
    },
    {
      id: "content",
      label: "問題の追加・充実",
      hint:
        "問題の元になる文章・メモ・箇条書きを送ってください。問題形式になっていなくて構いません。",
    },
    {
      id: "subject",
      label: "科目の追加案",
      hint: "新しい科目のご提案。追加可否は内容を見て検討します。",
    },
  ];

  function firebaseReady() {
    return typeof FirebaseApp !== "undefined" ? FirebaseApp.ready() : false;
  }

  function getDb() {
    return typeof FirebaseApp !== "undefined" ? FirebaseApp.getDb() : null;
  }

  function hasPremiumPack() {
    return (
      typeof Entitlement !== "undefined" &&
      Entitlement.getEntitlements &&
      Entitlement.getEntitlements().pack === true
    );
  }

  function isAvailable() {
    return !!getDb() && hasPremiumPack();
  }

  function typeLabel(id) {
    const hit = TYPE_OPTIONS.find((t) => t.id === id);
    return hit ? hit.label : id || "—";
  }

  async function submit(payload) {
    const db = getDb();
    if (!db) throw new Error("Firebase が未設定のため送信できません。");
    if (!hasPremiumPack()) {
      throw new Error("プレミアムパック購読中のみ送信できます。");
    }

    const user = firebase.auth && firebase.auth().currentUser;
    if (!user) throw new Error("ログインが必要です。");

    const message = String(payload.message || "").trim();
    if (message.length < 10) throw new Error("内容を10文字以上書いてください。");
    if (message.length > 12000) throw new Error("内容は12000文字以内にしてください。");

    const type = String(payload.type || "feature");
    const known = TYPE_OPTIONS.some((t) => t.id === type);
    const typeId = known ? type : "feature";

    const doc = {
      type: typeId,
      typeLabel: typeLabel(typeId),
      message,
      subjectId: String(payload.subjectId || "").slice(0, 80),
      subjectTitle: String(payload.subjectTitle || "").slice(0, 120),
      appVersion: typeof APP_VERSION !== "undefined" ? APP_VERSION : "",
      userEmail: user.email || null,
      userId: user.uid,
      status: "open",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("premiumRequests").add(doc);
    return true;
  }

  return {
    TYPE_OPTIONS,
    isAvailable,
    hasPremiumPack,
    submit,
    typeLabel,
  };
})();
