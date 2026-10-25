//
// Webhook の署名検証が通っているかを数える台帳。
//
// なぜ要るか: 署名シークレット (whsec) が Firebase 側と Stripe 側で食い違うと、
// constructEvent は必ず落ち、Stripe には 400 が返る。つまり誰が買っても権利が
// 1件も付かない。売上0件の理由がこれである可能性がある。ところがその失敗は
// Stripe の画面にしか出ないので、私からは観測できず、社長に聞くしかなかった
// (10/09 から未回答)。ここに数を残せば、Stripe の「テストイベントを送信」を
// 1回押すだけで、管理画面が答えを出す。聞かずに済むようになる。
//
// 鉄則: この書き込みは webhook を壊してはいけない。付与より後ではなく前に
// 走るので、ここで投げると入金が反映されない。だから何があっても黙って捨てる。
//
const admin = require("firebase-admin");

const COLLECTION = "system";
const DOC_ID = "stripeWebhookHealth";
const MESSAGE_MAX = 120;

function defaultFieldValues() {
  return {
    stamp: function () { return admin.firestore.FieldValue.serverTimestamp(); },
    incr: function () { return admin.firestore.FieldValue.increment(1); },
  };
}

function ref(db) {
  return db.collection(COLLECTION).doc(DOC_ID);
}

// 失敗の種類を、社長が読んで次の一手が決まる粒度で分ける。
// signature_mismatch なら whsec の取り違え。header_missing なら
// Stripe 以外からの呼び出し。timestamp なら時計かリプレイ。
// 並び順が効く: Stripe の「Unable to extract timestamp and signatures from
// header」は timestamp の語を含むので、時刻の判定を先に置くと取り違える。
// 最初に書いた形はこれで1件落ちた (テストが先に捕まえた)。
function classifyFailure(message) {
  const m = String(message === null || message === undefined ? "" : message).toLowerCase();
  if (m.indexOf("no stripe-signature") >= 0) return "header_missing";
  if (m.indexOf("unable to extract") >= 0) return "header_missing";
  if (m.indexOf("no signatures found") >= 0) return "signature_mismatch";
  if (m.indexOf("timestamp") >= 0) return "timestamp_outside_tolerance";
  return "other";
}

// ok なら成功の数と時刻、偽なら失敗の数と時刻と種類を足す。
// 戻り値は「書けたか」。呼び元はこれを見ないでよい。
async function recordVerifyResult(db, ok, message, fieldValues) {
  try {
    const fv = fieldValues || defaultFieldValues();
    const next = ok
      ? { okCount: fv.incr(), lastOkAt: fv.stamp() }
      : {
          failCount: fv.incr(),
          lastFailAt: fv.stamp(),
          lastFailKind: classifyFailure(message),
          lastFailMessage: String(message === null || message === undefined ? "" : message).slice(0, MESSAGE_MAX),
        };
    await ref(db).set(next, { merge: true });
    return true;
  } catch (err) {
    console.warn("recordVerifyResult skipped:", (err && err.message) || err);
    return false;
  }
}

function isoOf(value) {
  if (value && typeof value.toDate === "function") {
    try { return value.toDate().toISOString(); } catch (e) { return null; }
  }
  return null;
}

// 管理画面に出すための読み出し。読めなければ null を返す
// (「0件」と「読めなかった」を混ぜない)。
async function readVerifyHealth(db) {
  try {
    const snap = await ref(db).get();
    const exists = !!(snap && snap.exists);
    const d = (exists && snap.data()) || {};
    return {
      recorded: exists,
      okCount: Number(d.okCount || 0),
      failCount: Number(d.failCount || 0),
      lastOkAt: isoOf(d.lastOkAt),
      lastFailAt: isoOf(d.lastFailAt),
      lastFailKind: String(d.lastFailKind || ""),
      lastFailMessage: String(d.lastFailMessage || ""),
    };
  } catch (err) {
    console.warn("readVerifyHealth failed:", (err && err.message) || err);
    return null;
  }
}

module.exports = {
  COLLECTION,
  DOC_ID,
  classifyFailure,
  recordVerifyResult,
  readVerifyHealth,
};
