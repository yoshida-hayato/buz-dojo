//
// IndexNow の送信を実際に走らせる側 (判定と台帳は indexnow.js)。
//
// 形: 定時に1日1回走り、本番の sitemap.xml を読んで、その一覧を投げる。
// sitemap を正本にしているので、科目や着地頁が増えたときに、ここを
// 直さなくても追いつく (gen-seo.py がデプロイのたびに書き出している)。
//
// 何があっても投げない。投げると定時の枠が失敗として記録されるだけで、
// 誰も見ないまま毎日赤くなる。結果は戻り値と台帳に残す。
//
const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

const core = require("./indexnow");

const REGION = "asia-northeast1";
const ERROR_MAX = 160;

// 定時の刻み。アスタリスクはパッチの経路に載せられないので、コード点から組む
// (index.js が Stripe の全イベントの印を組んでいるのと同じ作法)。
const STAR = String.fromCharCode(42);
const DAILY_0441 = "41 4 " + STAR + " " + STAR + " " + STAR;

function nowFetch() {
  // Node 22 の global fetch。差し替えられるように1枚かぶせる。
  return function (url, init) { return fetch(url, init); };
}

// 戻り値の形は固定: 何が起きても同じ鍵が揃っている (画面が分岐で割れないため)。
function emptyResult() {
  return { reason: "", submitted: false, attempted: false, urlCount: 0, status: 0, error: "" };
}

async function runSubmit(options) {
  const opts = options || {};
  const db = opts.db || null;
  const doFetch = opts.fetchImpl || nowFetch();
  const nowMs = typeof opts.nowMs === "number" ? opts.nowMs : Date.now();
  const force = opts.force === true;
  const out = emptyResult();

  try {
    const got = await doFetch(core.SITEMAP_URL, { method: "GET" });
    const okGet = !!got && (got.ok === true || Number(got.status) === 200);
    if (!okGet) {
      out.reason = "sitemap_unreachable";
      out.status = Number((got && got.status) || 0);
      out.error = "sitemap status " + out.status;
      out.attempted = true;
      await core.record(db, out, null);
      return out;
    }
    const urls = core.parseSitemapLocs(await got.text());
    out.urlCount = urls.length;

    const prev = await core.readState(db);
    const verdict = force && urls.length
      ? { submit: true, reason: "forced" }
      : core.decide(prev, urls, nowMs);
    out.reason = verdict.reason;
    if (!verdict.submit) {
      await core.record(db, out, null);
      return out;
    }

    out.attempted = true;
    const posted = await doFetch(core.ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(core.buildBody(urls)),
    });
    out.status = Number((posted && posted.status) || 0);
    // 200 は受け取った、202 は受け取って鍵の確認待ち。どちらも送れている。
    out.submitted = out.status === 200 || out.status === 202;
    if (!out.submitted) out.error = "indexnow status " + out.status;
    await core.record(db, out, urls);
    return out;
  } catch (err) {
    out.error = String((err && err.message) || err).slice(0, ERROR_MAX);
    out.attempted = true;
    try {
      await core.record(db, out, null);
    } catch (e) {
      // 台帳に残せなくても、ここで投げたら定時の枠が落ちる。捨てる。
    }
    return out;
  }
}

// 奉仕用の口座の名前は index.js から渡す。字面がメールアドレスに見えるので、
// パッチの経路に載せるとリンク記法に書き替えられる。既に main に在る定数を使う。
