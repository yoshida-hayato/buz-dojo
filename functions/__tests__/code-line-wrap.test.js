//
// 擬似言語の囲みを、携帯の幅で読めるようにする仕掛けのガード。
//
// 実測 (2026-11-07): 科目B で囲みを持つ37問のうち、幅360 で16問、幅390 で
// 7問が横にはみ出していた。
// 直し方は2つ組で、片方だけでは効かない。
//   (1) wrapCodeLines が、囲みの中身を1行ずつ span (class は code-line) で
//       包み、その行の先頭の空白の数に3を足したぶら下げ字下げを付ける
//   (2) quiz.css が、code-line を持つ囲みだけを折り返す
// (2) を囲み全部に広げると、構文ブラウザ (同じ class の囲みを自分で組む)
// が黙って変わる。素の囲みが pre のままであることも見張る。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const DOM_UTIL = path.join("js", "dom-util.js");
const QUIZ_CSS = path.join("css", "quiz.css");
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const NL = String.fromCharCode(10);
const FENCE = String.fromCharCode(96, 96, 96);
const CLASS = "code-line";

const formatRichText = (function () {
  const sandbox = { String, Array, Object, JSON, Math, RegExp, console };
  vm.createContext(sandbox);
  vm.runInContext(read(DOM_UTIL), sandbox, { filename: "dom-util" });
  return vm.runInContext("formatRichText", sandbox);
})();

const fence = (lines) => FENCE + NL + lines.join(NL) + NL + FENCE;
const spans = (html) => html.split(LT + "span class=" + String.fromCharCode(34) + CLASS).length - 1;

// n番目の span の padding-left の値 (ch を外した数)。
function padOf(html, nth) {
  const parts = html.split("padding-left:");
  if (parts.length <= nth + 1) return null;
  return parts[nth + 1].split("ch")[0];
}
function indentOf(html, nth) {
  const parts = html.split("text-indent:");
  if (parts.length <= nth + 1) return null;
  return parts[nth + 1].split("ch")[0];
}

describe("コード囲みの行の包み (描く側)", () => {
  test("囲みの中の行の数だけ span が出る", () => {
    expect(spans(formatRichText(fence(["a", "b", "c"])))).toBe(3);
    expect(spans(formatRichText(fence(["a"])))).toBe(1);
  });

  test("囲みが2つ在れば両方とも包まれる", () => {
    const s = fence(["a", "b"]) + NL + "あいだの文" + NL + fence(["c"]);
    expect(spans(formatRichText(s))).toBe(3);
  });

  test("囲みの外の文には span を足さない", () => {
    expect(spans(formatRichText("ただの問題文" + NL + "2行目"))).toBe(0);
  });

  test("pre と code の囲み自体は今までどおり", () => {
    const html = formatRichText(fence(["a"]));
    expect(html.indexOf(LT + 'pre class="code-block"' + GT + LT + "code" + GT) >= 0).toBe(true);
    expect(html.indexOf(LT + "/code" + GT + LT + "/pre" + GT) >= 0).toBe(true);
  });

  test("ぶら下げ字下げは、その行の先頭の空白の数に3を足した幅", () => {
    const html = formatRichText(fence(["x", "  y", "    z"]));
    expect(padOf(html, 0)).toBe("3");
    expect(padOf(html, 1)).toBe("5");
    expect(padOf(html, 2)).toBe("7");
  });

  test("字下げは padding と同じ幅の負の値 (1行目を左端に戻す)", () => {
    const html = formatRichText(fence(["x", "  y"]));
    expect(indentOf(html, 0)).toBe("-3");
    expect(indentOf(html, 1)).toBe("-5");
  });

  // 実体参照は口で素の記号に戻るので、文字コードから組む。
  test("中身は今までどおり escape されている", () => {
    const AMP = String.fromCharCode(38);
    const html = formatRichText(fence([LT + "b" + GT + "と" + AMP]));
    expect(html.indexOf(LT + "b" + GT) < 0).toBe(true);
    expect(html.indexOf(AMP + "lt;b" + AMP + "gt;") >= 0).toBe(true);
    expect(html.indexOf(AMP + "amp;") >= 0).toBe(true);
  });

  test("描いた後にバッククォートが残らない", () => {
    expect(formatRichText(fence(["a", "b"])).indexOf(FENCE) < 0).toBe(true);
  });
});

describe("コード囲みの行の包み (見た目の側)", () => {
  const css = read(QUIZ_CSS);

  // 規則の中身を取り出す。無ければ null。
  function ruleBody(selector) {
    const at = css.indexOf(selector + " {");
    if (at < 0) return null;
    const from = at + selector.length + 2;
    const end = css.indexOf("}", from);
    if (end < 0) return null;
    return css.slice(from, end);
  }

  test("code-line を持つ囲みだけが折り返す", () => {
    const body = ruleBody(".code-block:has(." + CLASS + ")");
    expect(body === null).toBe(false);
    expect(body.indexOf("white-space: pre-wrap") >= 0).toBe(true);
  });

  test("素の囲みは折り返さない (構文ブラウザを動かさない)", () => {
    const body = ruleBody(".code-block");
    expect(body === null).toBe(false);
    expect(body.indexOf("white-space: pre;") >= 0).toBe(true);
  });

  test("行は block で置く (でないと字下げが効かない)", () => {
    const body = ruleBody(".code-block ." + CLASS);
    expect(body === null).toBe(false);
    expect(body.indexOf("display: block") >= 0).toBe(true);
  });

  test("css の class 名と、描く側の class 名が一致している", () => {
    expect(css.indexOf("." + CLASS) >= 0).toBe(true);
    expect(read(DOM_UTIL).indexOf('class="' + CLASS + '"') >= 0).toBe(true);
  });
});
