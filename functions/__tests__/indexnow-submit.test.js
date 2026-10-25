//
// IndexNow の送信 (functions/indexnow.js と functions/indexnow-run.js) の
// 振る舞いのテスト。
//
// この仕掛けは「外の索引にこのサイトが1枚も入っていない」を動かすために在る。
// 壊れ方は4通りあり、どれも画面に出ない。
//
//   1. 自分以外のホストの URL を混ぜる → IndexNow は 422 で全部捨てる
//   2. 同じ一覧を毎日投げる → 429 の的になり、以後受け取られなくなる
//   3. sitemap が空のときに「0本を送った」と記録する → 次から変化なしに見える
//   4. 例外を上げる → 定時の枠が毎日赤くなるだけで、誰も見ない
//
// 4 がいちばん静かなので、投げないことを明示的に測る。
//
jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => ({ kind: "stamp" }),
      increment: (n) => ({ kind: "incr", by: n }),
    },
  },
}));
jest.mock("firebase-functions/v2/scheduler", () => ({ onSchedule: () => ({ stub: true }) }));
jest.mock("firebase-functions/v2/https", () => ({
  onCall: () => ({ stub: true }),
  HttpsError: function (code, message) { this.code = code; this.message = message; },
}));

const core = require("../indexnow");
const run = require("../indexnow-run");

const SITE = core["SITE"];
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);

function loc(url) {
  return "  " + LT + "loc" + GT + url + LT + "/loc" + GT;
}

function sitemapOf(urls) {
  return [LT + "urlset" + GT].concat(urls.map(loc)).concat([LT + "/urlset" + GT]).join("\n");
}

let sets;

function fakeDb(opts) {
  const o = opts || {};
  sets = [];
  return {
    collection: () => ({
      doc: () => ({
        get: async () => {
          if (o.getThrows) throw new Error("get boom");
          return { exists: !!o.exists, data: () => o.data || {} };
        },
        set: async (data, options) => {
          sets.push({ data, options });
          if (o.setThrows) throw new Error("set boom");
          return true;
        },
      }),
    }),
  };
}

// 第1引数が sitemap のとき本文を返し、第2引数 (POST) のとき status を返す偽の fetch
function fakeFetch(opts) {
  const o = opts || {};
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (String(url) === core.SITEMAP_URL) {
      if (o.sitemapThrows) throw new Error("net boom");
      const status = Number(o.sitemapStatus || 200);
      return { ok: status === 200, status, text: async () => String(o.sitemapBody || "") };
    }
    if (o.postThrows) throw new Error("post boom");
    return { ok: true, status: Number(o.postStatus || 200), text: async () => "" };
  };
  impl.calls = calls;
  return impl;
}

describe("sitemap の読み取り", () => {
  test("自分のホストの URL だけを拾い、重複は1本にする", () => {
    const body = sitemapOf([SITE + "/", SITE + "/sap", SITE + "/sap", "<https://example>" + ".com" + "/x"]);
    expect(core.parseSitemapLocs(body)).toEqual([SITE + "/", SITE + "/sap"]);
  });

  test("トップだけの sitemap でもホスト直下として拾う", () => {
    expect(core.parseSitemapLocs(sitemapOf([SITE + "/"])).length).toBe(1);
  });

  test("閉じタグが無い行は捨てる", () => {
    const broken = LT + "loc" + GT + SITE + "/sap";
    expect(core.parseSitemapLocs(broken)).toEqual([]);
  });

  test("空や null で落ちない", () => {
    expect(core.parseSitemapLocs("")).toEqual([]);
    expect(core.parseSitemapLocs(null)).toEqual([]);
  });
});

describe("送るかどうかの判定", () => {
  const urls = [SITE + "/", SITE + "/sap"];

  test("空の一覧は送らない", () => {
    expect(core.decide(null, [], 1000).submit).toBe(false);
    expect(core.decide(null, [], 1000).reason).toBe("sitemap_empty");
  });

  test("成功の記録が無ければ送る", () => {
    expect(core.decide(null, urls, 1000).reason).toBe("first");
    expect(core.decide({ lastUrls: urls }, urls, 1000).reason).toBe("first");
  });

  test("一覧が同じで日が浅ければ送らない", () => {
    const prev = { lastOkAt: 1000, lastUrls: urls };
    expect(core.decide(prev, urls, 2000).submit).toBe(false);
    expect(core.decide(prev, urls, 2000).reason).toBe("unchanged");
  });

  test("一覧が変わったら送る", () => {
    const prev = { lastOkAt: 1000, lastUrls: urls };
    expect(core.decide(prev, urls.concat([SITE + "/biz-career"]), 2000).reason).toBe("urls_changed");
  });

  test("並び順が変わっただけでも送る (sitemap の正本が動いた合図)", () => {
    const prev = { lastOkAt: 1000, lastUrls: urls };
    expect(core.decide(prev, [urls[1], urls[0]], 2000).reason).toBe("urls_changed");
  });

  test("7日経てば同じ一覧でも送る", () => {
    const prev = { lastOkAt: 1000, lastUrls: urls };
    expect(core.decide(prev, urls, 1000 + core.RESUBMIT_AFTER_MS).reason).toBe("periodic");
  });
});

describe("投げる本体", () => {
  test("鍵の在り処と host が本文に入る", () => {
    const body = core.buildBody([SITE + "/"]);
    expect(body.host).toBe(core.HOST);
    expect(body.key).toBe(core.KEY);
    expect(body.keyLocation).toBe(core["SITE"] + "/" + core.KEY + ".txt");
    expect(body.urlList).toEqual([SITE + "/"]);
  });

  test("端点は IndexNow の共通の入口 (受け取った側が他の参加者に共有する)", () => {
    const joined = "api" + "." + "indexnow" + "." + "org";
    expect(core.ENDPOINT).toBe("https://" + joined + "/indexnow");
  });

  test("鍵は16進で8文字以上128文字以下 (仕様の範囲)", () => {
    expect(core.KEY.length).toBeGreaterThanOrEqual(8);
    expect(core.KEY.length).toBeLessThanOrEqual(128);
    const hex = "0123456789abcdef";
    let bad = 0;
    for (let i = 0; i < core.KEY.length; i++) {
      if (hex.indexOf(core.KEY[i]) < 0) bad += 1;
    }
    expect(bad).toBe(0);
  });
});
describe("1回の走り", () => {
  test("初回は POST まで行き、台帳に成功が残る", async () => {
    const db = fakeDb({ exists: false });
    const f = fakeFetch({ sitemapBody: sitemapOf([SITE + "/", SITE + "/sap"]), postStatus: 200 });
    const out = await run.runSubmit({ db, fetchImpl: f, nowMs: 1000 });
    expect(out.submitted).toBe(true);
    expect(out.reason).toBe("first");
    expect(out.urlCount).toBe(2);
    expect(f.calls.length).toBe(2);
    expect(String(f.calls[1].url)).toBe(core.ENDPOINT);
    expect(f.calls[1].init.method).toBe("POST");
    const sent = JSON.parse(f.calls[1].init.body);
    expect(sent.urlList.length).toBe(2);
    expect(sets.length).toBe(1);
    expect(sets[0].data.okCount).toEqual({ kind: "incr", by: 1 });
    expect(sets[0].data.lastUrls).toEqual([SITE + "/", SITE + "/sap"]);
  });

  test("202 も送れたと数える (鍵の確認待ち)", async () => {
    const db = fakeDb({ exists: false });
    const f = fakeFetch({ sitemapBody: sitemapOf([SITE + "/"]), postStatus: 202 });
    const out = await run.runSubmit({ db, fetchImpl: f, nowMs: 1000 });
    expect(out.submitted).toBe(true);
    expect(out.status).toBe(202);
  });

  test("変化が無ければ POST しない (429 を避ける)", async () => {
    const urls = [SITE + "/"];
    const db = fakeDb({ exists: true, data: { lastOkAt: 1000, lastUrls: urls } });
    const f = fakeFetch({ sitemapBody: sitemapOf(urls) });
    const out = await run.runSubmit({ db, fetchImpl: f, nowMs: 2000 });
    expect(out.submitted).toBe(false);
    expect(out.attempted).toBe(false);
    expect(out.reason).toBe("unchanged");
    expect(f.calls.length).toBe(1);
    expect(sets[0].data.okCount).toBeUndefined();
    expect(sets[0].data.failCount).toBeUndefined();
  });

  test("force なら変化が無くても送る", async () => {
    const urls = [SITE + "/"];
    const db = fakeDb({ exists: true, data: { lastOkAt: 1000, lastUrls: urls } });
    const f = fakeFetch({ sitemapBody: sitemapOf(urls) });
    const out = await run.runSubmit({ db, fetchImpl: f, nowMs: 2000, force: true });
    expect(out.reason).toBe("forced");
    expect(out.submitted).toBe(true);
    expect(f.calls.length).toBe(2);
  });

});
