// 手元のテストランナー (scripts/minijest.js) の約束の見張り。
//
// なぜ要るか: この箱から npm のレジストリに出られないので jest は入らない。
// このランナーは、社員が手元で検証できる唯一の道具である。壊れたことに
// 気づかないと、検証したつもりのパッチを出すことになる。
// 肝は照合の名前で、ここが食い違うと落ちるはずの変更が黙って通る。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const BACKTICK = String.fromCharCode(96);
const STAR = String.fromCharCode(42);
const YEN = String.fromCharCode(92);
const RUNNER_REL = path.join("scripts", "minijest.js");
const RUNNER_SRC = fs.readFileSync(path.join(ROOT, RUNNER_REL), "utf8");

// 識別子として続く字だけを取る。円記号が運べないので正規表現は使わない。
const WORD_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function leadingName(piece) {
  let name = "";
  for (let i = 0; i < piece.length; i += 1) {
    const c = piece.charAt(i);
    if (WORD_CHARS.indexOf(c) < 0) break;
    name += c;
  }
  return name;
}

// 素の JavaScript の to... は照合ではないので、ここで外す。
const NOT_MATCHERS = [
  "toString", "toFixed", "toPrecision", "toJSON", "toUpperCase", "toLowerCase",
  "toISOString", "toLocaleString", "toLocaleDateString", "toLocaleTimeString",
  "toUTCString", "toDateString", "toTimeString", "toSorted", "toReversed",
  "toSpliced", "toArray", "toExponential", "token", "topics", "top",
];

// テストの字面から、照合として呼ばれている名前を集める。
function matchersUsedBySuite() {
  const found = {};
  fs.readdirSync(__dirname).forEach(function (f) {
    if (f.slice(-8) !== ".test.js") return;
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    src.split(".").forEach(function (piece) {
      if (piece.indexOf("to") !== 0) return;
      const name = leadingName(piece);
      if (!name || NOT_MATCHERS.indexOf(name) >= 0) return;
      if (piece.charAt(name.length) !== "(") return;
      if (!found[name]) found[name] = [];
      if (found[name].indexOf(f) < 0) found[name].push(f);
    });
  });
  return found;
}

describe("ランナーはパッチの口を通る字面だけで書かれている", () => {
  test("素のバッククォートもアスタリスクも円記号も無い", () => {
    // 直し方: 改行は String.fromCharCode(10)、照合は indexOf と split で書く。
    //   ここに円記号が入ると、次にこのファイルを直すパッチが Slack の
    //   変換で壊れ、原因の分からない形で破棄される。
    expect(RUNNER_SRC.indexOf(BACKTICK)).toBe(-1);
    expect(RUNNER_SRC.indexOf(STAR)).toBe(-1);
    expect(RUNNER_SRC.indexOf(YEN)).toBe(-1);
  });

  test("構文として読める", () => {
    let err = "";
    try {
      void new vm.Script(RUNNER_SRC, { filename: RUNNER_REL });
    } catch (e) {
      err = e && e.message ? e.message : String(e);
    }
    expect(err).toBe("");
  });
});

describe("ランナーが、テストの前提をそろえている", () => {
  test("テストが前提にする大域を全部置いている", () => {
    // 取り付けは鉤かっこの形で見る。点でつなぐ形は、語が実在する TLD に
    // 見えるときに Slack がリンク記法に書き替えるので、ランナー側では
    // 使えない (2026-10-04 に it で1ファイルが壊れた。パッチの書き方を読むこと)。
    const Q = String.fromCharCode(34);
    const need = ["describe", "test", "it", "expect", "jest", "beforeEach", "afterEach", "beforeAll", "afterAll"];
    const missing = need.filter(function (n) {
      return RUNNER_SRC.indexOf("global[" + Q + n + Q + "]") < 0;
    });
    expect(missing.join(",")).toBe("");
  });

  test("jest の側で使っている口を置いている", () => {
    // mock を落とすと、それを使う7枚が読み込みで落ちる。
    const need = ["fn:", "mock:", "resetModules:", "spyOn:"];
    const missing = need.filter(function (n) {
      return RUNNER_SRC.indexOf(n) < 0;
    });
    expect(missing.join(",")).toBe("");
  });

  test("test.each を置いている (無いと表で書いた枚が読み込みで落ちる)", () => {
    expect(RUNNER_SRC.indexOf("test.each = each")).toBeGreaterThan(-1);
  });

  test("差し替えた依頼を1つの実体として覚える", () => {
    // 毎回 factory を呼び直すと、試験が覗く控えと試験対象の控えが別物に
    // なり、黙って undefined が出る (2026-11-07 にこれで6件落ちた)。
    expect(RUNNER_SRC.indexOf("mockCache")).toBeGreaterThan(-1);
  });
});

describe("テストが使う照合を、ランナーが全部知っている", () => {
  const used = matchersUsedBySuite();
  const names = Object.keys(used).sort();

  test("照合を拾えている", () => {
    expect(names.length).toBeGreaterThan(5);
    expect(names.indexOf("toBe")).toBeGreaterThan(-1);
  });

  test("ランナーに無い照合を使っているテストが無い", () => {
    // 直し方: scripts/minijest.js の matchers に、名前をキーにして足す。
    //   放置すると、jest では通るのに手元だけが嘘をつく状態になる。
    const missing = names.filter(function (n) {
      return RUNNER_SRC.indexOf(n + ": function") < 0;
    }).map(function (n) {
      return n + " (" + used[n].slice(0, 2).join(" ") + ")";
    });
    expect(missing.join(", ")).toBe("");
  });
});
