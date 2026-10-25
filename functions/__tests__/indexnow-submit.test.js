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

