//
// 習得数の分母の見張り (js/mastery-display.js)。
//
// なぜ要るか: 2026-11-01 に測った。習得数は Firestore のサマリに保存された値で、
// 旧マスタの問題IDで積まれていることがある。問題が減った科目では保存値が
// 現マスタの件数を超え、科目カード・マイページ・成績画面に
// 習得 600/500 (120%) のような行が出る経路が在った。
// mastery-display.js はテストが1件も無く、formatMastery が頭打ちを持たなかった。
//
// 見張る約束は3つ:
//   (1) 分母を超えた習得数は、分母で頭を打つ (率も100を超えない)
//   (2) 件数が読めていない (0) ときは頭を打たない。数は消さない
//   (3) 分母の内側の数は1も動かさない
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const NL = String.fromCharCode(10);
const SRC = fs.readFileSync(path.join(ROOT, "js", "mastery-display.js"), "utf8");

function load() {
  const sandbox = {
    Math, String, Number, Array, Object, JSON, Set,
    console: { warn: () => {}, error: () => {} },
    localStorage: {
      bag: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this.bag, k) ? this.bag[k] : null; },
      setItem(k, v) { this.bag[k] = String(v); },
      removeItem(k) { delete this.bag[k]; },
    },
  };
  const ctx = vm.createContext(sandbox);
  return vm.runInContext(SRC + NL + "; MasteryDisplay;", ctx);
}

describe("約束1: 分母を超えた習得数は分母で頭を打つ", () => {
  const M = load();
  test.each([
    [600, 500, 500, 100],
    [5071, 4951, 4951, 100],
    [943, 823, 823, 100],
    [9999, 60, 60, 100],
    [101, 100, 100, 100],
  ])("習得 %i / 全 %i", (stored, total, wantCount, wantPct) => {
    expect(M.clampMastered(stored, total)).toBe(wantCount);
    const fm = M.formatMastery(stored, total);
    expect(fm.pct).toBe(wantPct);
    expect(fm.secondary).toBe(wantPct + "%");
    expect(fm.primary).toBe("習得 " + wantCount + "/" + total);
  });
});

describe("約束2: 件数が読めていないときは数を消さない", () => {
  const M = load();
  test("分母0なら保存値をそのまま返す", () => {
    expect(M.clampMastered(600, 0)).toBe(600);
  });
  test("分母0の表示は全0問のまま (いままでと同じ)", () => {
    expect(M.formatMastery(600, 0).primary).toBe("全0問");
  });
  test("負の値と数でない値は0にする", () => {
    expect(M.clampMastered(-5, 100)).toBe(0);
    expect(M.clampMastered("x", 100)).toBe(0);
    expect(M.clampMastered(null, 100)).toBe(0);
  });
});

describe("約束3: 分母の内側の数は動かさない", () => {
  const M = load();
  test.each([
    [0, 100, 0],
    [1, 100, 1],
    [50, 100, 50],
    [100, 100, 100],
    [2600, 4951, 2600],
  ])("習得 %i / 全 %i", (stored, total, want) => {
    expect(M.clampMastered(stored, total)).toBe(want);
    expect(M.formatMastery(stored, total).primary).toBe("習得 " + want + "/" + total);
    expect(M.formatMastery(stored, total).pct).toBe(
      total === 0 ? 0 : Math.round((want / total) * 100)
    );
  });
});
