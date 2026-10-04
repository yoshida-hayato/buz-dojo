/**
 * 受入チェックリスト節1の「科目ごとの請求額」の表を、料金の式と突き合わせる。
 *
 * 節1はもともと Checkout の金額が画面の表示と一致することしか見ていない。
 * どちらも同じ式から出るので、両方そろって違っていると社長は気づけない。
 * 表は独立した期待値で、表そのものが腐ると意味を失うのでここで見張る。
 *
 * 表 → config の向きにしか要求していない (config に科目や問題数を足しても
 * 落ちない)。2ファイルの等値を要求すると、1件1ファイルで1件ずつ破棄する
 * ブリッジでは先に当たった片方が必ず落ちる (2026-10-04 16:48便の申し送り)。
 * 宣言が payment のときだけ実際の価格関数との一致も要求する。表が古ければ
 * 切替のパッチが落ちる。直し方は「表を先、宣言を後」で行き止まりは無い。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DOC_PATH = path.join(ROOT, "docs", "SANDBOX_TEST_CHECKLIST.md");
const pricing = require(path.join(ROOT, "config", "pricing.js"));
const docSrc = fs.readFileSync(DOC_PATH, "utf8");

const HEADING = "買い切りに切り替えたあとの、科目ごとの請求額";
/** 買い切りの単品上限とパック。config は宣言から導くのでここは直に置く */
const PAY_MAX = 1980;
const PAY_PACK = 3980;

function rowsOf(src) {
  const head = src.indexOf(HEADING);
  if (head < 0) return null;
  const rest = src.slice(head);
  const end = rest.indexOf("\n- [ ]");
  const lines = (end < 0 ? rest : rest.slice(0, end)).split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].charAt(0) !== "|") continue;
    const c = lines[i].split("|").map(function (s) { return s.trim(); });
    const count = Number(c[2]);
    const yen = Number(c[3]);
    if (!c[1] || !Number.isFinite(count) || !Number.isFinite(yen)) continue;
    rows.push({ id: c[1], count: count, yen: yen });
  }
  return rows;
}

/** 買い切りモードでの単品価格。式は config と同形で、上限だけ買い切りの値 */
function payPrice(n) {
  const MIN = pricing.PRICE_MIN;
  const FREE = pricing.FREE_SUBJECT_MAX_COUNT;
  const CAP = pricing.PRICE_CAP_COUNT;
  const c = Math.max(0, Number(n) || 0);
  if (c <= FREE) return 0;
  if (c >= CAP) return PAY_MAX;
  const t = Math.min(1, (c - FREE) / (CAP - FREE));
  return Math.round((MIN + t * (PAY_MAX - MIN)) / 10) * 10;
}

/** 字面は件数で比べる。toContain で落とすと全文が失敗メッセージに流れる */
function count(src, needle) {
  let n = 0;
  let i = src.indexOf(needle);
  while (i >= 0) {
    n += 1;
    i = src.indexOf(needle, i + needle.length);
  }
  return n;
}

describe("受入チェックリスト節1の請求額の表", () => {
  const rows = rowsOf(docSrc);

  test("表が在り、科目の行が10件以上ある", () => {
    expect(rows).not.toBeNull();
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  test("表の科目idはすべて config に在る", () => {
    const bad = rows.filter(function (r) { return !pricing.isKnownSubject(r.id); });
    expect(bad.map(function (r) { return r.id; })).toEqual([]);
  });

  test("同じ科目が2行に出ていない", () => {
    const ids = rows.map(function (r) { return r.id; });
    const uniq = ids.filter(function (v, i) { return ids.indexOf(v) === i; });
    expect(ids.length).toBe(uniq.length);
  });

  test("表の金額は、同じ行の問題数から買い切りの式で導ける", () => {
    const bad = rows.filter(function (r) { return payPrice(r.count) !== r.yen; });
    expect(bad.map(function (r) { return r.id + ":" + r.yen + " want " + payPrice(r.count); })).toEqual([]);
  });
});

describe("受入チェックリスト節1の請求額の表 (続き)", () => {
  const rows = rowsOf(docSrc);

  test("式の前提になる定数が config と一致している", () => {
    expect(pricing.PRICE_MIN).toBe(290);
    expect(pricing.FREE_SUBJECT_MAX_COUNT).toBe(100);
    expect(pricing.PRICE_CAP_COUNT).toBe(3000);
  });

  test("上限と無料の端点が買い切りの式で正しい", () => {
    expect(payPrice(pricing.PRICE_CAP_COUNT)).toBe(PAY_MAX);
    expect(payPrice(pricing.PRICE_CAP_COUNT + 1)).toBe(PAY_MAX);
    expect(payPrice(pricing.FREE_SUBJECT_MAX_COUNT)).toBe(0);
    expect(payPrice(pricing.FREE_SUBJECT_MAX_COUNT + 1)).toBe(pricing.PRICE_MIN);
  });

  test("無料科目の行は3件以上あり、どれも無料の上限以下", () => {
    const free = rows.filter(function (r) { return r.yen === 0; });
    expect(free.length).toBeGreaterThanOrEqual(3);
    const over = free.filter(function (r) { return r.count > pricing.FREE_SUBJECT_MAX_COUNT; });
    expect(over.map(function (r) { return r.id; })).toEqual([]);
  });

  test("パックの金額と、表が腐ったときの読み方が書かれている", () => {
    expect(count(docSrc, "プレミアムパックは " + PAY_PACK + " 円")).toBe(1);
    expect(count(docSrc, "問題数が動けば金額も動く")).toBe(1);
    expect(count(docSrc, "金額ではなく問題数のほうを先に疑う")).toBe(1);
  });

  test("切替後は、実際の価格関数と表が一致する", () => {
    if (pricing.CHECKOUT_MODE !== "payment") return;
    expect(pricing.PRICE_MAX).toBe(PAY_MAX);
    expect(pricing.PACK_PRICE_YEN).toBe(PAY_PACK);
    const bad = rows.filter(function (r) { return pricing.priceForQuestionCount(r.count) !== r.yen; });
    expect(bad.map(function (r) { return r.id; })).toEqual([]);
  });
});
