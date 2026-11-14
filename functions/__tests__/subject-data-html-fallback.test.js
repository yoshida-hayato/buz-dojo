//
// 無いファイルが 200 で頁を返す経路の見張り (js/subject-loader.js)。
//
// なぜ要るか (2026-11-09 に社長が本番で踏み、2026-11-14 に実測した):
//   同一ドメインに問題データを置いた3科目 (基本情報 科目A / 科目B /
//   応用情報 科目B) では、置いていないファイルにも catch-all rewrite が
//   200 で index.html を返す。res.ok は真になり、頁の本文が new Function に
//   渡って SyntaxError で落ちる。この3科目は公開から8日間、一度も開けなかった。
//   マスタがよその repo に在る10科目は本物の 404 が返るので踏まない。
//
// 1,086件の試験がこの経路を1度も通していなかった理由は、偽の fetch が
// 「在る」と「ok が偽」の2通りしか作っておらず、本番に在る3通り目
// (ok が真で、中身が頁) が試験の語彙に無かったことである。
//
// 見張る約束は4つ。(0) が落ちたら下の3つは何も測っていない。
//
const H = require("../test-helpers/subject-loader-sandbox");
const { load, makeFetch, PAGE, REAL_QUESTIONS, REAL_JUDGMENT, NL } = H;

describe("約束0: 足場が本物の経路を歩ける", () => {
  test("問題データが素の JS なら科目が開く", async () => {
    const f = makeFetch({
      "questions.js": REAL_QUESTIONS,
      "judgment-questions.js": REAL_JUDGMENT,
    }, PAGE);
    const { api, win } = load(f);
    const out = await api.loadSubject("fe-kamoku-b");
    expect(out.meta.id).toBe("fe-kamoku-b");
    expect(win.QUIZ_DATA.length).toBe(3);
    expect(api.getLoadedId()).toBe("fe-kamoku-b");
  });

  test("足場が、本番に在る3通り目の応答を本当に作れている", async () => {
    const f = makeFetch({}, PAGE);
    const res = await f("/data/fe-kamoku-b/judgment-questions.js");
    expect(res.ok).toBe(true);
    const body = await res.text();
    expect(body.charCodeAt(0)).toBe(60);
  });
});

describe("約束1: 頁の見分けが、頁と JS を取り違えない", () => {
  const { api } = load(makeFetch({}, PAGE));

  test("頁は頁と見分ける", () => {
    expect(api.looksLikeHtmlResponse(PAGE)).toBe(true);
  });

  test("先頭に空白や改行が在っても見分ける", () => {
    expect(api.looksLikeHtmlResponse("  " + NL + PAGE)).toBe(true);
  });

  test("先頭に見えない字 (BOM) が在っても見分ける", () => {
    expect(api.looksLikeHtmlResponse(String.fromCharCode(65279) + PAGE)).toBe(true);
  });

  test("素の JS は頁と見なさない", () => {
    expect(api.looksLikeHtmlResponse(REAL_QUESTIONS)).toBe(false);
    expect(api.looksLikeHtmlResponse(REAL_JUDGMENT)).toBe(false);
  });

  test("空と未定義は頁と見なさない", () => {
    expect(api.looksLikeHtmlResponse("")).toBe(false);
    expect(api.looksLikeHtmlResponse(undefined)).toBe(false);
  });
});
