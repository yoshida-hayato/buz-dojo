/**
 * Stripe Webhook の購読イベントを、コードとセットアップ手順書で一致させる。
 *
 * なぜ必要か: 購読から漏れたイベントは「署名検証は通る / 例外は出ない /
 * ログにも残らない / ただ走らない」という形で静かに落ちる。本番切替のときに
 * 社長が見るのは docs/STRIPE_SETUP.md のリストだけなので、そのリストが
 * コードより1件少ないと、その1件は永久に購読されない。
 * 実際に 2026-10-03 時点で checkout.session.async_payment_succeeded が
 * コードにはあり手順書には無かった (「必要な6件」と書かれていた)。
 *
 * このテストは Stripe に接続しない。コードの switch と Markdown の
 * 箇条書きを突き合わせるだけ。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const INDEX_PATH = path.join(ROOT, "functions", "index.js");
const DOC_PATH = path.join(ROOT, "docs", "STRIPE_SETUP.md");

const indexSrc = fs.readFileSync(INDEX_PATH, "utf8");
const docSrc = fs.readFileSync(DOC_PATH, "utf8");

/** functions/index.js の switch にある case のイベント名 */
function eventsInCode(src) {
  const found = [];
  const re = /case\s+"([a-z0-9_]+(?:\.[a-z0-9_]+)+)"\s*:/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

/** 手順書の「コードが分岐しているイベント」節の箇条書き */
function eventsInDoc(src) {
  const head = src.indexOf("### コードが分岐しているイベント");
  if (head < 0) return null;
  const rest = src.slice(head);
  const end = rest.indexOf("\n上の");
  const body = end < 0 ? rest : rest.slice(0, end);
  const found = [];
  const re = /^- ([a-z0-9_]+(?:\.[a-z0-9_]+)+)\s/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

describe("Stripe Webhook のイベント: コードと手順書", () => {
  const code = eventsInCode(indexSrc);
  const doc = eventsInDoc(docSrc);

  test("手順書に該当の節がある", () => {
    expect(doc).not.toBeNull();
  });

  test("コード側のイベントを1件以上拾えている (正規表現が腐っていない)", () => {
    expect(code.length).toBeGreaterThanOrEqual(5);
    expect(code).toContain("checkout.session.completed");
    expect(code).toContain("charge.refunded");
  });

  test("コードが分岐している全イベントが手順書に書かれている", () => {
    const missing = code.filter((e) => !doc.includes(e));
    expect(missing).toEqual([]);
  });

  test("手順書にあって、コードがもう分岐していないイベントが無い", () => {
    const stale = doc.filter((e) => !code.includes(e));
    expect(stale).toEqual([]);
  });

  test("遅延通知の入金 (コンビニ・銀行振込) が両方に入っている", () => {
    expect(code).toContain("checkout.session.async_payment_succeeded");
    expect(doc).toContain("checkout.session.async_payment_succeeded");
  });

  test("見出しと本文の「必要なN件」が実際の件数と合っている", () => {
    const n = code.length;
    expect(docSrc).toContain(`### コードが分岐しているイベント (必要な${n}件)`);
    expect(docSrc).toContain(`「送信対象イベント」に必要な${n}件が入っていること`);
    expect(docSrc).toContain(`上の${n}件以外は switch の default で無視される`);
  });

  test("1イベント1行で書かれている (スラッシュでまとめていない)", () => {
    const head = docSrc.indexOf("### コードが分岐しているイベント");
    const rest = docSrc.slice(head);
    const end = rest.indexOf("\n上の");
    const body = end < 0 ? rest : rest.slice(0, end);
    const bullets = body.split("\n").filter((l) => l.startsWith("- "));
    expect(bullets.length).toBe(code.length);
    for (const line of bullets) {
      const name = line.slice(2).split(" ")[0];
      expect(code).toContain(name);
    }
  });
});
