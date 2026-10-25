//
// IndexNow の送信。検索側に「この URL を見に来てほしい」と自分から伝える。
//
// なぜ要るか: 18:48便 の実測で、外の検索索引にこのサイトの頁が1枚も
// 入っていないことが分かった (ドメインを直接指定して0件。対照として
// 同じ無料ドメインの他のサイトと日本語の頁はどちらも返るので、道具の
// 都合では説明が付かない)。外から張られたリンクも、公開リポジトリの1本だけである。
// Search Console への登録は社長のアカウントが要り、10/09 から未回答のまま。
//
// IndexNow は口座も確認も要らない。鍵の字面をサイトの根に1枚置き、
// その鍵を添えて URL の一覧を投げるだけで、受け取った側が他の参加者にも
// 共有する (Microsoft の webmaster ブログに明記。参加者の一覧は
// IndexNow の searchengines.json にあり、bing / yandex / seznam / naver /
// yep / internetarchive / amazonbot の7つ)。Google は参加していないので、
// これは Google の代わりにはならない。Search Console の依頼は取り下げない。
//
// 鉄則2つ:
//   1. 何があっても投げない。定時に走る関数なので、ここで例外を上げても
//      誰も見ないが、同じ便の他の仕事を落とす形にはしない
//   2. 同じ一覧を毎日投げない。IndexNow は投げすぎに 429 を返す。
//      一覧が変わったときと、7日経ったときだけ送る
//
const admin = require("firebase-admin");

// 鍵は公開前提のもの (サイトの根に字面で置く)。秘密ではない。
// _dev/gen-seo.py の INDEXNOW_KEY と1文字でも違うと 403 になる。
// indexnow-wiring のテストが両方を突き合わせている。
const KEY = "361b8945e17ec20392b62140dee53cd7";

const HOST = "buz-dojo" + "." + "web" + "." + "app";
const SITE = "https://" + HOST;
const SITEMAP_URL = SITE + "/sitemap.xml";
const KEY_LOCATION = SITE + "/" + KEY + ".txt";
// ドメインの字面を素で書くと、パッチの経路 (Slack) がリンク記法に書き替える。
// 部品に割って組み立てる。gen-seo.py と同じ作法。
const ENDPOINT = "https://" + "api" + "." + "indexnow" + "." + "org" + "/indexnow";

const COLLECTION = "system";
const DOC_ID = "indexNow";
// 7日 (ミリ秒)。掛け算の記号はパッチの経路に載せられないので数で書く。
const RESUBMIT_AFTER_MS = 604800000;
const ERROR_MAX = 160;

// sitemap は XML なので山かっこを読む。字面で書かずコード点から組む
// (パッチの経路でタグの字面が化ける事故を避けるため)。
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const LOC_OPEN = LT + "loc" + GT;
const LOC_CLOSE = LT + "/loc" + GT;

// sitemap.xml から自分のホストの URL だけを取り出す。
// 他のホストを混ぜると IndexNow は 422 を返して全部捨てる。
function parseSitemapLocs(xml) {
  const text = String(xml === null || xml === undefined ? "" : xml);
  const out = [];
  const parts = text.split(LOC_OPEN);
  for (let i = 1; i < parts.length; i++) {
    const end = parts[i].indexOf(LOC_CLOSE);
    if (end < 0) continue;
    const url = parts[i].slice(0, end).trim();
    if (url.indexOf(SITE + "/") !== 0) continue;
    if (out.indexOf(url) < 0) out.push(url);
  }
  return out;
}

function sameList(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (String(x[i]) !== String(y[i])) return false;
  }
  return true;
}

function msOf(value) {
  if (value && typeof value.toDate === "function") {
    try { return value.toDate().getTime(); } catch (e) { return 0; }
  }
  if (typeof value === "number") return value;
  return 0;
}

// 送るかどうか。空の一覧は送らない (sitemap の生成が転んだときに
// 「0本を送った」と記録して、次から変化なしと見える形を避ける)。
function decide(prev, urls, nowMs) {
  if (!urls || !urls.length) return { submit: false, reason: "sitemap_empty" };
  const p = prev || {};
  const lastOk = msOf(p.lastOkAt);
  if (!lastOk) return { submit: true, reason: "first" };
  if (!sameList(p.lastUrls, urls)) return { submit: true, reason: "urls_changed" };
  if (nowMs - lastOk >= RESUBMIT_AFTER_MS) return { submit: true, reason: "periodic" };
  return { submit: false, reason: "unchanged" };
}

function buildBody(urls) {
  return { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: (urls || []).slice() };
}

function ref(db) {
  return db.collection(COLLECTION).doc(DOC_ID);
}

function fieldValues() {
  return {
    stamp: function () { return admin.firestore.FieldValue.serverTimestamp(); },
    incr: function () { return admin.firestore.FieldValue.increment(1); },
  };
}

async function readState(db) {
  try {
    if (!db) return null;
    const snap = await ref(db).get();
    if (!snap || !snap.exists) return null;
    return snap.data() || {};
  } catch (err) {
    console.warn("indexnow readState failed:", (err && err.message) || err);
    return null;
  }
}

// 台帳に残す。書けなくても投げない。
async function record(db, out, urls, fv) {
  try {
    if (!db) return false;
    const f = fv || fieldValues();
    const next = { lastCheckedAt: f.stamp(), lastReason: String(out.reason || ""), lastUrlCount: Number(out.urlCount || 0) };
    if (out.submitted) {
      next.lastOkAt = f.stamp();
      next.lastStatus = Number(out.status || 0);
      next.lastUrls = (urls || []).slice();
      next.okCount = f.incr();
    } else if (out.attempted) {
      next.lastFailAt = f.stamp();
      next.lastStatus = Number(out.status || 0);
      next.lastError = String(out.error || "").slice(0, ERROR_MAX);
      next.failCount = f.incr();
    }
    await ref(db).set(next, { merge: true });
    return true;
  } catch (err) {
    console.warn("indexnow record skipped:", (err && err.message) || err);
    return false;
  }
}

module.exports = {
  KEY,
  HOST,
  SITE,
  SITEMAP_URL,
  KEY_LOCATION,
  ENDPOINT,
  COLLECTION,
  DOC_ID,
  RESUBMIT_AFTER_MS,
  parseSitemapLocs,
  sameList,
  decide,
  buildBody,
  readState,
  record,
};
