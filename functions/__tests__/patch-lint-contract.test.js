//
// scripts/patch-lint.js の約束 (パッチの字面の検査器)。
//
// なぜ要るか: 引き継ぎメモの パッチの書き方 は135行で、全部が
// 「この字面を入れて1件落ちた」の記録である。1便10件から20件を手で見るのは
// 当たらない。2026-11-08 に、確実に分かっている規則だけを機械に写した。
// この1枚は、その検査器が規則を落としていないことを見る。
//
// 肝は約束4である。検査器そのものが Slack の口を通って main に入るので、
// 危険な字面を素で書くと、着いた時点で検査器が壊れている。だから自分の
// ソースを「新規作成のパッチ」として自分に食わせて、NG が0件であることを見る。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const LINT = require(path.join(ROOT, "scripts", "patch-lint.js"));
const NL = String.fromCharCode(10);
const BT = String.fromCharCode(96);
const AST = String.fromCharCode(42);
const BS = String.fromCharCode(92);
const AMP = String.fromCharCode(38);
const LT = String.fromCharCode(60);
const AT = String.fromCharCode(64);

// 素直に通る1通 (ここから1つずつ崩して、崩したものだけが落ちることを見る)
function base(extra) {
  const o = {
    title: "ためしの1件",
    rationale: "これは試験用の payload である",
    path: "js/rank.js",
    old_string: "function foo() {" + NL + "  return 1;" + NL + "}" + NL,
    new_string: "function foo() {" + NL + "  return 2;" + NL + "}" + NL,
  };
  Object.keys(extra || {}).forEach((k) => {
    if (extra[k] === null) delete o[k];
    else o[k] = extra[k];
  });
  return JSON.stringify(o);
}

const ngOf = (text) => LINT.lintText(text).ng;
const hasNg = (text) => ngOf(text).length > 0;

describe("約束1: 素直な1通は NG を出さない", () => {
  test("置換の形", () => {
    expect(ngOf(base())).toEqual([]);
  });
  test("新規作成の形 (old_string が空)", () => {
    expect(ngOf(base({ old_string: "" }))).toEqual([]);
  });
  test("追記の形", () => {
    const t = base({ old_string: null, new_string: null, append: "1行" + NL });
    expect(ngOf(t)).toEqual([]);
  });
  test("アスタリスク1個は通る (実測で1個までは運べる)", () => {
    expect(ngOf(base({ rationale: "2 " + AST + " 3 の話" }))).toEqual([]);
  });
  test("改行の n と引用符の円記号は通る", () => {
    expect(ngOf(base({ new_string: "a" + NL + 'b "c" d' + NL }))).toEqual([]);
  });
});

describe("約束2: 実測で落ちた形は、1つずつ NG になる", () => {
  test("バッククォート (囲みが壊れる)", () => {
    expect(hasNg(base({ new_string: "const a = " + BT + "x" + BT + ";" }))).toBe(true);
  });
  test("アスタリスク2個 (payload 全体で1個まで)", () => {
    expect(hasNg(base({ rationale: AST + "強調" + AST }))).toBe(true);
  });
  test("円記号の不正なエスケープ", () => {
    // JSON としては解ける形のまま、円記号 + d を字面に混ぜる
    const raw = base({ new_string: "a" + NL }).split('"a' + BS + 'n"').join('"a' + BS + 'n' + BS + 'd"');
    expect(raw.indexOf(BS + "d") >= 0).toBe(true);
    expect(hasNg(raw)).toBe(true);
  });
  test("円記号を2つ重ねる (Slack が1つに畳む)", () => {
    const raw = base({ new_string: "a" + NL }).split('"a' + BS + 'n"').join('"a' + BS + BS + BS + 'n"');
    expect(raw.indexOf(BS + BS) >= 0).toBe(true);
    expect(hasNg(raw)).toBe(true);
  });
  test("実体参照 (ブリッジの unescape 1回では戻らない)", () => {
    const ent = AMP + "lt" + String.fromCharCode(59);
    expect(hasNg(base({ new_string: "if (a " + ent + " b) {}" }))).toBe(true);
  });
  test("アットマーク (メールの形に化ける)", () => {
    expect(hasNg(base({ rationale: "宛先は me" + AT + "example" }))).toBe(true);
  });
  test("スキーム (URL はリンク記法に化ける)", () => {
    const u = "http" + String.fromCharCode(58) + "//" + "example";
    expect(hasNg(base({ rationale: u }))).toBe(true);
  });
  test("見出しタグを素で書く", () => {
    expect(hasNg(base({ new_string: LT + "h1 class=x" + String.fromCharCode(62) }))).toBe(true);
  });
  test("追加+削除が200行を超える", () => {
    const big = new Array(260).join("x" + NL);
    expect(hasNg(base({ new_string: big }))).toBe(true);
  });
  test("対象外の拡張子", () => {
    expect(hasNg(base({ path: "scripts/hello.txt" }))).toBe(true);
  });
  test.each([
    ".github/workflows/x.yml",
    "scripts/bridge/apply_patch.py",
    "src/data/questions.js",
    "marketing/copy.md",
  ])("触れない場所 %s", (p) => {
    expect(hasNg(base({ path: p }))).toBe(true);
  });
  test("title か path が無い", () => {
    expect(hasNg(base({ title: null }))).toBe(true);
    expect(hasNg(base({ path: null }))).toBe(true);
  });
  test("new_string も append も無い", () => {
    expect(hasNg(base({ new_string: null }))).toBe(true);
  });
  test("JSON として解けない", () => {
    expect(hasNg("{これは JSON ではない")).toBe(true);
  });
});

describe("約束3: 注意 は NG にしない", () => {
  test("ドメインに見える字面は 注意 に出て、NG には出ない", () => {
    const r = LINT.lintText(base({ rationale: "global" + ".it" + " の形" }));
    expect(r.ng).toEqual([]);
    expect(r.warn.length).toBeGreaterThan(0);
  });
  test("実測で無傷に通った q.id は 注意 にも出さない (一覧に入れない)", () => {
    const r = LINT.lintText(base({ new_string: "const v = q.id;" + NL }));
    expect(r.ng).toEqual([]);
    expect(r.warn).toEqual([]);
  });
});

describe("約束4: 検査器そのものが、自分の規則に通る", () => {
  test("自分のソースを新規作成のパッチにして食わせると NG は0件", () => {
    const src = fs.readFileSync(path.join(ROOT, "scripts", "patch-lint.js"), "utf8");
    const payload = JSON.stringify({
      title: "検査器そのもの",
      rationale: "自己適用",
      path: "scripts/patch-lint.js",
      old_string: "",
      new_string: src,
    });
    expect(LINT.lintText(payload).ng).toEqual([]);
  });
  test("自分のソースは200行以内である", () => {
    const src = fs.readFileSync(path.join(ROOT, "scripts", "patch-lint.js"), "utf8");
    expect(src.split(NL).length).toBeLessThanOrEqual(LINT.MAX_LINES);
  });
  test("この1枚そのものも、パッチとして運べる形である", () => {
    const src = fs.readFileSync(__filename, "utf8");
    const payload = JSON.stringify({
      title: "この1枚",
      rationale: "自己適用",
      path: "functions/__tests__/patch-lint-contract.test.js",
      old_string: "",
      new_string: src,
    });
    expect(LINT.lintText(payload).ng).toEqual([]);
  });
});
