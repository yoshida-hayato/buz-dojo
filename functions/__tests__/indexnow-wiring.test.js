//
// IndexNow の配線のガード。字面だけを読む (台本を走らせない)。
//
// この仕掛けは、どこか1本が外れただけで黙って何も起きなくなる形をしている。
//
//   1. 鍵の字面が2箇所 (gen-seo.py と functions/indexnow.js) に在り、
//      1文字でも違うと IndexNow は 403 を返す。画面には何も出ない
//   2. 鍵の txt を書き出す行が消えると、鍵が在ることを確かめられず 403
//   3. 定時の口が index.js から export されていないと、関数が存在しない
//   4. 管理画面の js が読み込まれていないと、人が結果を読む場所が無くなる
//   5. ドメインの字面を素で書くと、パッチの経路 (Slack) がリンク記法に
//      書き替えて構文が壊れる。端点のドメインは部品に割っておく
//
// 検出したい字面を、このファイルに素のままでは書かない (同じ変換の的になる)。
// 正規表現は使わない。indexOf と split で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const GEN = read("_dev/gen-seo.py");
const CORE = read("functions/indexnow.js");
const RUN = read("functions/indexnow-run.js");
const INDEX = read("functions/index.js");
const PANEL = read("js/admin-indexnow.js");
const REPORTS = read("admin/reports.html");

// 1つの字面を、その宣言の行から切り出す。見つからなければ空を返す。
function valueAfter(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return "";
  const rest = text.slice(at + marker.length);
  const end = rest.indexOf('"');
  if (end < 0) return "";
  return rest.slice(0, end);
}

describe("鍵の字面", () => {
  const fromGen = valueAfter(GEN, 'INDEXNOW_KEY = "');
  const fromCore = valueAfter(CORE, 'const KEY = "');

  test("gen-seo.py と functions/indexnow.js の鍵が同じ", () => {
    expect(fromGen.length).toBeGreaterThan(0);
    expect(fromCore).toBe(fromGen);
  });

  test("鍵は16進で8文字以上128文字以下", () => {
    expect(fromGen.length).toBeGreaterThanOrEqual(8);
    expect(fromGen.length).toBeLessThanOrEqual(128);
    const hex = "0123456789abcdef";
    let bad = 0;
    for (let i = 0; i < fromGen.length; i++) {
      if (hex.indexOf(fromGen[i]) < 0) bad += 1;
    }
    expect(bad).toBe(0);
  });

  test("台本は鍵の txt を書き出す", () => {
    expect(GEN.indexOf('write(INDEXNOW_KEY + ".txt", INDEXNOW_KEY)') >= 0).toBe(true);
  });

  test("台本は何があっても終了コード0で抜ける (鍵の行を足しても落ちない)", () => {
    expect(GEN.indexOf("except Exception") >= 0).toBe(true);
    expect(GEN.indexOf("sys.exit(0)") >= 0).toBe(true);
  });
});

describe("端点のドメインは部品に割る", () => {
  // 素で書かれていたら、この字面が1本につながって現れる
  const joined = "api" + "." + "indexnow" + "." + "org";

  test("functions/indexnow.js に素のドメインが無い", () => {
    expect(CORE.indexOf(joined) < 0).toBe(true);
  });

  test("それでも端点は部品から組み立てられている", () => {
    const pieces = '"api" + "." + "indexnow" + "." + "org"';
    expect(CORE.indexOf(pieces) >= 0).toBe(true);
    expect(CORE.indexOf('"/indexnow"') >= 0).toBe(true);
  });
});

describe("定時の口と押す口", () => {
  test("index.js が indexnow-run を読んでいる", () => {
    expect(INDEX.indexOf('require("./indexnow-run")') >= 0).toBe(true);
  });

  test("定時の口と押す口の両方を export し、奉仕用の口座を渡している", () => {
    expect(INDEX.indexOf("exports.indexNowSubmit = createIndexNowScheduleExport(SERVICE_ACCOUNT)") >= 0).toBe(true);
    expect(INDEX.indexOf("exports.runIndexNowSubmit = createRunIndexNowSubmitExport(SERVICE_ACCOUNT)") >= 0).toBe(true);
  });

  test("定時の口は日に1回で、時刻帯を名乗っている", () => {
    expect(RUN.indexOf('timeZone: "Asia/Tokyo"') >= 0).toBe(true);
    expect(RUN.indexOf("schedule: DAILY_0441") >= 0).toBe(true);
    expect(RUN.indexOf("41 4 ") >= 0).toBe(true);
  });

  test("口座の字面を indexnow-run.js に持たない (メールに見える字面は運べない)", () => {
    const mailish = "gserviceaccount" + "." + "com";
    expect(RUN.indexOf(mailish) < 0).toBe(true);
    expect(RUN.indexOf("serviceAccount: serviceAccount") >= 0).toBe(true);
  });

  test("押す口はログインと管理者の2段で絞っている", () => {
    expect(RUN.indexOf("request.auth") >= 0).toBe(true);
    expect(RUN.indexOf("COMPLIMENTARY_PACK_EMAILS.includes(who)") >= 0).toBe(true);
    expect(RUN.indexOf("permission-denied") >= 0).toBe(true);
  });

  test("鍵そのものは画面の口から返ってよいが、秘密は返さない", () => {
    // IndexNow の鍵は公開前提 (サイトの根に字面で置く) なので返して構わない。
    // 取り違え防止のため、Stripe の鍵の名前がここに混ざっていないことを見る。
    expect(RUN.indexOf("STRIPE") < 0).toBe(true);
    expect(RUN.indexOf("stripeSecret") < 0).toBe(true);
  });
});

describe("管理画面", () => {
  test("reports.html が管理画面の js を読み込む", () => {
    expect(REPORTS.indexOf("admin-indexnow.js") >= 0).toBe(true);
  });

  test("escapeHtml を先に読む並びになっている (自前のエスケープを書かない)", () => {
    const util = REPORTS.indexOf("dom-util.js");
    const mine = REPORTS.indexOf("admin-indexnow.js");
    expect(util).toBeGreaterThan(0);
    expect(mine).toBeGreaterThan(util);
    expect(PANEL.indexOf("escapeHtml(") >= 0).toBe(true);
  });

  test("画面が呼ぶ関数名が、index.js が export した名前と同じ", () => {
    const called = valueAfter(PANEL, 'var FN = "');
    expect(called).toBe("runIndexNowSubmit");
    expect(INDEX.indexOf("exports." + called + " =") >= 0).toBe(true);
  });

  test("画面は Google も通知先だと書かない (IndexNow に Google は参加していない)", () => {
    const at = PANEL.indexOf("Google");
    expect(at).toBeGreaterThan(0);
    expect(PANEL.indexOf("Google は参加していません") >= 0).toBe(true);
  });
});
