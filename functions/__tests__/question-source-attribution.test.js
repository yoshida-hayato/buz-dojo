// 公開過去問の出典が、解説の面に実際に出ることのガード。
//
// なぜ要るか (2026-10-26):
//   許諾を確認できた4団体 (情報処理推進機構・日本FP協会・法務省・厚生労働省)
//   はいずれも、出典の明記と、改変した場合はその旨の明記を条件にしている。
//   つまり出典が出ないと、無料で載せてよい根拠そのものが崩れる。
//   課金が動いている商用サイトなので、ここは見た目の問題ではない。
//
//   問題データ本体はよその repo (学習道場マスタ) が持っている。だから
//   「source の付いたデータが来た日に、画面が黙って落とす」が最も危ない。
//   データより先に受け皿を見張る。
//
// 壊し方の想定: 呼び出しを外す / source を無視する / 改変の註を落とす /
//   出題ごとに消さずに前の問題の出典が残る / 字面をそのまま HTML に差し込む
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = fs.readFileSync(path.join(ROOT, "js", "quiz-engine.js"), "utf8");
const QUIZ_CSS = fs.readFileSync(path.join(ROOT, "css", "quiz.css"), "utf8");

const FN = "function renderQuestionSource(entry) {";

function node(tag) {
  return {
    tag: tag,
    className: "",
    textContent: "",
    kids: [],
    parentNode: null,
    appendChild: function (c) {
      c.parentNode = this;
      this.kids.push(c);
      return c;
    },
    removeChild: function (c) {
      this.kids = this.kids.filter(function (x) {
        return x !== c;
      });
      c.parentNode = null;
    },
    querySelector: function (sel) {
      const want = sel.replace(".", "");
      return (
        this.kids.filter(function (k) {
          return k.className === want;
        })[0] || null
      );
    },
  };
}

// renderQuestionSource だけを切り出して動かす。host を返す
function render(entries, opts) {
  const o = opts || {};
  const host = o.noHost ? null : node("div");
  const i = ENGINE.indexOf(FN);
  if (i < 0) throw new Error("renderQuestionSource が見つからない");
  const body = ENGINE.slice(i, ENGINE.indexOf("\n}\n", i) + 3);
  const ctx = {
    document: { createElement: node },
    $: function (id) {
      return id === "feedback-answer" ? host : null;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(body + "\n;globalThis.__R = renderQuestionSource;", ctx);
  for (const e of entries) ctx.__R(e);
  return host;
}

function sourceLines(host) {
  return host.kids
    .filter(function (k) {
      return k.className === "feedback-source";
    })
    .map(function (k) {
      return k.textContent;
    });
}

describe("出典の行", () => {
  test("source が在れば出る", () => {
    const host = render([
      { source: "平成31年度 春期 基本情報技術者試験 午前 問1" },
    ]);
    expect(sourceLines(host)).toEqual([
      "出典: 平成31年度 春期 基本情報技術者試験 午前 問1",
    ]);
  });

  test("改変したときは、その旨が一緒に出る", () => {
    const host = render([{ source: "令和7年度 問12", sourceModified: true }]);
    expect(sourceLines(host)).toEqual(["出典: 令和7年度 問12（一部改変）"]);
  });

  test("自作問題 (source 無し) には1行も足さない", () => {
    expect(sourceLines(render([{}]))).toEqual([]);
    expect(sourceLines(render([{ source: "" }]))).toEqual([]);
    expect(sourceLines(render([{ source: "   " }]))).toEqual([]);
    expect(sourceLines(render([null]))).toEqual([]);
  });

  test("前の問題の出典が残らない", () => {
    const host = render([
      { source: "令和7年度 問1" },
      { source: "令和6年度 問2" },
    ]);
    expect(sourceLines(host)).toEqual(["出典: 令和6年度 問2"]);
  });

  test("自作問題に進んだら、前の出典は消える", () => {
    const host = render([{ source: "令和7年度 問1" }, {}]);
    expect(sourceLines(host)).toEqual([]);
  });

  test("面が無いときに落ちない", () => {
    expect(render([{ source: "令和7年度 問1" }], { noHost: true })).toBe(null);
  });

  test("字面を HTML として差し込まない", () => {
    // 団体の書式をそのまま出すので、山かっこが混じる余地が在る。
    // innerHTML を使うと、そこが差し込み口になる。
    const body = ENGINE.slice(ENGINE.indexOf(FN));
    const fnBody = body.slice(0, body.indexOf("\n}\n"));
    expect(fnBody.indexOf("innerHTML") < 0).toBe(true);
    expect(fnBody.indexOf("textContent") >= 0).toBe(true);
  });
});

describe("呼び出しと見た目", () => {
  test("解説の面を組む流れの中で呼ばれている", () => {
    const call = ENGINE.indexOf("renderQuestionSource(q.entry)");
    const report = ENGINE.indexOf('resetQuestionReportForm();\n  $("question-report").open = false;');
    expect(call).toBeGreaterThan(0);
    expect(report).toBeGreaterThan(0);
    expect(call).toBeLessThan(report);
  });

  test("出典の行に見た目が付いている", () => {
    expect(QUIZ_CSS.indexOf(".feedback-source {") >= 0).toBe(true);
  });
});
