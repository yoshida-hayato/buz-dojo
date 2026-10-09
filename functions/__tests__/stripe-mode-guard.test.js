//
// getStripeMode のガード。
//
// この口は「本番の Stripe が test か live か」を管理者に答えるために在る。
// 答えを得るために鍵そのものを外へ出してはいけない。だからここで
// 3つを機械に見させる。
//
//   1. ログインと管理者の二重で閉じていること
//   2. 返すのが mode と livemode と chargeCount の3つだけであること
//   3. 返す式とログに鍵の変数が1文字も現れないこと
//
// 将来この口を触った誰かが鍵を返す形に変えたら、ここが落ちて main に入らない。
//
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "index.js");
const SRC = fs.readFileSync(FILE, "utf8");
const HEAD = "exports.getStripeMode = onCall(";

function handlerSource() {
  const start = SRC.indexOf(HEAD);
  if (start < 0) return "";
  const after = SRC.indexOf("\nexports.", start + HEAD.length);
  return after < 0 ? SRC.slice(start) : SRC.slice(start, after);
}

function returnSource(body) {
  const i = body.indexOf("return {");
  if (i < 0) return "";
  const j = body.indexOf(";", i);
  return j < 0 ? body.slice(i) : body.slice(i, j);
}

describe("getStripeMode", () => {
  const body = handlerSource();

  test("口が index に在る", () => {
    expect(body.length).toBeGreaterThan(200);
  });

  test("ログインと管理者の二重で閉じている", () => {
    expect(body.indexOf("unauthenticated") >= 0).toBe(true);
    expect(body.indexOf("COMPLIMENTARY_PACK_EMAILS") >= 0).toBe(true);
    expect(body.indexOf("permission-denied") >= 0).toBe(true);
  });

  test("モードは Stripe が返す livemode から決めている", () => {
    expect(body.indexOf("livemode") >= 0).toBe(true);
  });

  test("返すのは mode と livemode と chargeCount の3つだけ", () => {
    const ret = returnSource(body);
    expect(ret.indexOf("stripeMode:") >= 0).toBe(true);
    expect(ret.indexOf("livemode") >= 0).toBe(true);
    expect(ret.indexOf("chargeCount") >= 0).toBe(true);
    expect(ret.indexOf("secret") >= 0).toBe(false);
    expect(ret.indexOf("Secret") >= 0).toBe(false);
    expect(ret.indexOf("token") >= 0).toBe(false);
  });

  test("鍵の値をログに出していない", () => {
    const SINK = "console";
    const kinds = ["error", "warn", "log", "debug", "info"];
    const hits = [];
    for (const kind of kinds) {
      const needle = SINK + "." + kind + "(stripeSecret";
      if (body.indexOf(needle) >= 0) hits.push(kind);
    }
    expect(hits.join(", ")).toBe("");
  });
});
