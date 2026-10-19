/**
 * 無料枠の残りの字面の単体テスト。
 *
 * なぜ1つの関数に集めたか:
 *   2026-10-19 まで、同じ数字が3つの画面で3とおりの字で出ていた。
 *   カードは 本日あと20/20、科目ホームは 本日あと 20 / 20問、
 *   マイページは 本日あと 20 / 20問。単位の無い比の形は、390px の幅で
 *   710円 と 全823問 と並ぶと数字が3つ続き、どれが何の数かが読めない。
 *   実装を js/entitlement.js の1つだけにして、3つの画面はそれを呼ぶ。
 *
 * 読み込み方: entitlement.js は <script> で読まれる素のスクリプトで
 * module.exports が無く、const 宣言は vm のコンテキストに出てこないので、
 * 末尾に1行だけ足して取り出す。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC_PATH = path.join(__dirname, "..", "..", "js", "entitlement.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");
const SCREENS = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "screens-subjects.js"),
  "utf8"
);
const MYPAGE = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "screens-mypage.js"),
  "utf8"
);

function loadEntitlement() {
  const store = {};
  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    Number,
    String,
    Boolean,
    Object,
    Array,
    setTimeout,
    clearTimeout,
    window: {},
    document: { addEventListener() {} },
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
    __out: {},
  });
  // SRC は改行で終わっているので、そのまま繋いでよい
  vm.runInContext(SRC + "__out.E = Entitlement;", ctx, { filename: "entitlement.js" });
  return ctx.__out.E;
}

const E = loadEntitlement();

describe("freeQuotaLabel (無料枠の残りの字面)", () => {
  test("まだ1問も使っていない日は上限そのものを問で出す", () => {
    expect(E.freeQuotaLabel(20, 20)).toBe("本日あと20問");
  });

  test("途中まで使った日は残りを問で出す", () => {
    expect(E.freeQuotaLabel(7, 20)).toBe("本日あと7問");
    expect(E.freeQuotaLabel(1, 20)).toBe("本日あと1問");
  });

  test("使い切った日は数ではなく終わったことを出す", () => {
    expect(E.freeQuotaLabel(0, 20)).toBe("本日の無料ぶんは終了");
  });

  test("負の残りも使い切りとして扱う (記録が壊れていても数字を出さない)", () => {
    expect(E.freeQuotaLabel(-3, 20)).toBe("本日の無料ぶんは終了");
  });

  test("残りが上限を超えていても上限で止める", () => {
    expect(E.freeQuotaLabel(25, 20)).toBe("本日あと20問");
  });

  test("上限が無い・読めないときは何も出さない (0問 と出さない)", () => {
    expect(E.freeQuotaLabel(5, 0)).toBe("");
    expect(E.freeQuotaLabel(5, null)).toBe("");
  });

  test("上限を省くと FREE_DAILY を使う", () => {
    expect(E.freeQuotaLabel(99)).toBe("本日あと" + E.FREE_DAILY + "問");
  });

  test("単位の無い比の形を1文字も返さない", () => {
    for (let r = 0; r !== 25; r++) {
      expect(E.freeQuotaLabel(r, 20).indexOf("/")).toBe(-1);
    }
  });
});

describe("字面の実装は1つだけ", () => {
  test("entitlement.js が持ち主である", () => {
    expect(SRC.indexOf("function freeQuotaLabel")).toBeGreaterThan(-1);
    expect(SRC.indexOf("freeQuotaLabel,")).toBeGreaterThan(-1);
  });

  test("マイページは自前で組まずに entitlement.js を呼ぶ", () => {
    expect(MYPAGE.indexOf("Entitlement.freeQuotaLabel")).toBeGreaterThan(-1);
    expect(MYPAGE.indexOf("本日あと")).toBe(-1);
  });

  test("科目一覧と科目ホームも自前で組まない", () => {
    expect(SCREENS.indexOf("Entitlement.freeQuotaLabel")).toBeGreaterThan(-1);
    // 字面そのものは1箇所にも書かれていないこと (渡すだけの関数が残るだけ)
    expect(SCREENS.indexOf("本日あと")).toBe(-1);
    expect(SCREENS.indexOf("本日の無料ぶん")).toBe(-1);
  });
});
