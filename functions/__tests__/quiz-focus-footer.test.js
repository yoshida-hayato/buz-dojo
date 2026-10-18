// 出題中にサイト共通フッターを畳むことのガード。
//
// 2026-10-18 09:05 に社長から「サイトの表示があまり好きではないので、
// 学習系のプラットフォームも参考に UI を大幅に改造してほしい」と依頼を受けた。
// 12:48便 に Chromium で出題画面を描いて測ったところ、390x844 (携帯の主要な幅)
// で、出題中の文書の高さ 1690px のうち 913px (54%) がサイト共通フッターだった。
// 回答した直後は自動スクロールが効いて画面の y=616 からフッターが見えており、
// 解説を読んでいる画面の下 228px が「科目一覧・ガイド・会社情報」の回遊リンクで
// 埋まっていた。学習の最中に学習以外の出口を並べている状態である。
//
// 直し方は body の class 1つと CSS 1行。markup は一切触らないので、JS を
// 実行しないクローラと JS 無効の閲覧者には、今までどおりフッターの
// 科目一覧リンクが届く (index-html-guard が見張っている資産を壊さない)。
//
// 実測 (Chromium, 問題文3行・解説5行の問題):
//   390幅 出題中の文書 1690px -> 844px、回答後 2068px -> 1107px
//   1280幅 回答後 1414px -> 947px
//   どの幅でも、出題カード内の要素の文書座標は1pxも動かない
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NAV_SRC = path.join(ROOT, "js", "screens-nav.js");
const BASE_CSS = path.join(ROOT, "css", "base.css");
const INDEX_HTML = path.join(ROOT, "index.html");

/** class の付け外しだけを記録する最小の body */
function makeBody() {
  const set = new Set();
  return {
    has: (c) => set.has(c),
    classList: {
      toggle(c, on) {
        if (on) set.add(c);
        else set.delete(c);
      },
      add(c) {
        set.add(c);
      },
      remove(c) {
        set.delete(c);
      },
      contains: (c) => set.has(c),
    },
  };
}

function runNav(screenName) {
  const body = makeBody();
  const sandbox = {
    document: {
      body,
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null,
    },
    $: () => null,
    CURRENT_SUBJECT: null,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(NAV_SRC, "utf8"), sandbox);
  sandbox.updateHeaderChrome(screenName);
  return body;
}

describe("出題中はサイト共通フッターを畳む", () => {
  test("quiz のときだけ body に quiz-screen-active が付く", () => {
    expect(runNav("quiz").has("quiz-screen-active")).toBe(true);
    ["home", "subjects", "result", "stats", "mypage", "premium", "lesson"].forEach(
      (name) => {
        expect(runNav(name).has("quiz-screen-active")).toBe(false);
      }
    );
  });

  test("既存の2つの class の付き方は変わっていない", () => {
    expect(runNav("subjects").has("subjects-screen-active")).toBe(true);
    expect(runNav("quiz").has("subjects-screen-active")).toBe(false);
    expect(runNav("premium").has("premium-screen-active")).toBe(true);
    expect(runNav("quiz").has("premium-screen-active")).toBe(false);
  });

  test("base.css に畳む指定が1つだけ在る", () => {
    const css = fs.readFileSync(BASE_CSS, "utf8");
    const hits = css.match(/body\.quiz-screen-active\s+\.site-footer\s*\{[^}]*\}/g) || [];
    expect(hits.length).toBe(1);
    expect(/display:\s*none/.test(hits[0])).toBe(true);
  });

  test("フッターの markup は残っている (クローラと JS 無効に届く)", () => {
    const html = fs.readFileSync(INDEX_HTML, "utf8");
    expect(html.indexOf('<footer class="site-footer">') >= 0).toBe(true);
    // 科目一覧のリンクはフッターの中に在る。畳むのは表示だけで、数は減らさない
    const nav = html.split('<footer class="site-footer">')[1] || "";
    const links = nav.match(/<li><a href="\/[^"]*">/g) || [];
    // 科目10本 + ガイド3本 + 法務3本。畳むのは表示だけで、数は減らさない
    expect(links.length).toBeGreaterThanOrEqual(16);
  });
});
