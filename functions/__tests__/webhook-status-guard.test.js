//
// getStripeWebhookStatus のガード。
//
// この口は「本番の Webhook に、コードが分岐している7件が入っているか」を
// 管理者に答えるために在る。答えを得るために鍵そのものを外へ出してはいけない。
// また、必要イベントの一覧がコードの switch からずれたら、この口は
// 「欠けていない」と嘘をつく。だからここで4つを機械に見させる。
//
//   1. 口が index に在り、ログインと管理者の二重で閉じていること
//   2. 返す式に鍵の変数が1文字も現れないこと
//   3. 必要イベントの一覧が switch の case と完全に一致すること
//   4. 全イベントのワイルドカードを素の文字で書いていないこと
//      (パッチ経路にその文字を載せられないため、コード点から組む約束)
//
// 落ちたときの直し方: 3 が落ちたら functions/index.js の
// WEBHOOK_EVENTS_REQUIRED を switch の case と同じ並びにそろえる。
// case を足したなら一覧にも足す。docs/STRIPE_SETUP.md 側は
// webhook-events-doc.test.js が別に見張っている。
//
// 正規表現は使わない (パッチ経路に量指定子を通せない)。
//
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "index.js");
const SRC = fs.readFileSync(FILE, "utf8");
const HEAD = "exports.getStripeWebhookStatus = onCall(";

function handlerSource() {
  const start = SRC.indexOf(HEAD);
  if (start < 0) return "";
  const after = SRC.indexOf("\nexports.", start + HEAD.length);
  return after < 0 ? SRC.slice(start) : SRC.slice(start, after);
}

function returnSource(body) {
  const i = body.lastIndexOf("return {");
  if (i < 0) return "";
  const j = body.indexOf("\n    };", i);
  return j < 0 ? body.slice(i) : body.slice(i, j);
}

// 二重引用符で囲まれた文字列を順に取り出す。
function quoted(chunk) {
  const out = [];
  const parts = chunk.split('"');
  for (let i = 1; i < parts.length; i = i + 2) out.push(parts[i]);
  return out;
}

function requiredList() {
  const key = "const WEBHOOK_EVENTS_REQUIRED = [";
  const start = SRC.indexOf(key);
  if (start < 0) return null;
  const end = SRC.indexOf("];", start);
  if (end < 0) return null;
  return quoted(SRC.slice(start + key.length, end));
}

function switchCases() {
  const out = [];
  const needle = 'case "';
  let at = SRC.indexOf(needle);
  while (at >= 0) {
    const from = at + needle.length;
    const to = SRC.indexOf('"', from);
    if (to > from) {
      const name = SRC.slice(from, to);
      if (name.indexOf(".") > 0 && out.indexOf(name) < 0) out.push(name);
    }
    at = SRC.indexOf(needle, from);
  }
  return out;
}

describe("getStripeWebhookStatus", () => {
  const body = handlerSource();

  test("口が index に在る", () => {
    expect(body.length).toBeGreaterThan(200);
  });

  test("ログインと管理者の二重で閉じている", () => {
    expect(body.indexOf("unauthenticated") >= 0).toBe(true);
    expect(body.indexOf("COMPLIMENTARY_PACK_EMAILS") >= 0).toBe(true);
    expect(body.indexOf("permission-denied") >= 0).toBe(true);
  });

  test("返す式に鍵が現れない", () => {
    const ret = returnSource(body);
    expect(ret.indexOf("endpoints") >= 0).toBe(true);
    expect(ret.indexOf("secret") >= 0).toBe(false);
    expect(ret.indexOf("Secret") >= 0).toBe(false);
    expect(ret.indexOf("token") >= 0).toBe(false);
  });

  test("鍵の値をログに出していない", () => {
    const SINK = "console";
    const kinds = ["error", "warn", "log", "debug", "info"];
    const hits = [];
    for (const kind of kinds) {
      if (body.indexOf(SINK + "." + kind + "(stripeSecret") >= 0) hits.push(kind);
    }
    expect(hits.join(", ")).toBe("");
  });

  test("ワイルドカードを素の文字で書かず、コード点から組んでいる", () => {
    expect(body.indexOf("String.fromCharCode(42)") >= 0).toBe(true);
  });
});

describe("必要イベントの一覧が switch と一致している", () => {
  const required = requiredList();
  const cases = switchCases();

  test("一覧を取り出せている", () => {
    expect(required).not.toBeNull();
    expect(required.length).toBeGreaterThanOrEqual(5);
  });

  test("switch の case を取り出せている", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
    expect(cases).toContain("charge.refunded");
  });

  test("switch に在って一覧に無いものが無い", () => {
    const missing = cases.filter((name) => required.indexOf(name) < 0);
    expect(missing.join(", ")).toBe("");
  });

  test("一覧に在って switch に無いものが無い", () => {
    const stale = required.filter((name) => cases.indexOf(name) < 0);
    expect(stale.join(", ")).toBe("");
  });

  test("買い切りで取り消しを担う2件が一覧に在る", () => {
    expect(required).toContain("charge.refunded");
    expect(required).toContain("charge.dispute.closed");
  });
});
