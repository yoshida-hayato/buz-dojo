//
// 学習記録のマージ（学習道場・SAP道場 → ビジネス道場）の安全装置
//
// この経路は1ユーザー1回きりである。legacy-import.js は取り込みが済むと
// flagField を立て、以後は options.force か detailThin でなければ
// already_imported で返す。つまりここで記録を1件落とすと、その人の
// 学習履歴は二度と戻らない。212行のこのファイルにテストが1件も無かったので置く。
//
const {
  emptyStats,
  normalizeStats,
  mergeStats,
  statsChanged,
  buildSummaryPayload,
  qSize,
} = require("../stats-merge.js");

const fs = require("fs");
const path = require("path");
const importSrc = fs.readFileSync(
  path.join(__dirname, "..", "legacy-import.js"),
  "utf8"
);

describe("空の判定が、呼び出し側の入口条件と食い違わない", () => {
  // 入口は「answered が 0 かつ q が空」のときだけ止める。片方しか無い
  // 書き出しは mergeStats まで流れてくる。
  test("入口は answered と q の両方を見て no_data を決めている", () => {
    expect(importSrc).toContain("incoming.answered === 0 && incomingQ === 0");
  });

  test("回帰: 取り込み側が answered 0 でも q に行があれば捨てない", () => {
    const current = { answered: 4, correct: 3, q: { "sap-1": { a: 4, c: 3, k: 1 } } };
    const incoming = { answered: 0, q: { "sap-9": { a: 2, c: 2, k: 2 } } };
    const merged = mergeStats(current, incoming);
    expect(qSize(merged)).toBe(2);
    expect(merged.q["sap-9"].a).toBe(2);
    expect(merged.q["sap-1"].a).toBe(4);
  });

  test("回帰: 手元が answered 0 でも q に行があれば捨てない", () => {
    const current = { answered: 0, q: { "sap-1": { a: 1, c: 1, k: 1 } } };
    const incoming = { answered: 7, correct: 5, q: { "sap-9": { a: 7, c: 5, k: 2 } } };
    const merged = mergeStats(current, incoming);
    expect(qSize(merged)).toBe(2);
    expect(merged.q["sap-1"].a).toBe(1);
    expect(merged.answered).toBe(7);
  });

  test("本当に何も無い側は、そのまま相手を返す", () => {
    const only = { answered: 3, correct: 1, q: { "sap-1": { a: 3, c: 1 } } };
    expect(mergeStats(only, {}).answered).toBe(3);
    expect(mergeStats({}, only).answered).toBe(3);
    expect(mergeStats(null, null).answered).toBe(0);
    expect(qSize(mergeStats(null, null))).toBe(0);
  });
});

describe("混ぜ方（合算ではなく max と和集合）", () => {
  const left = {
    answered: 10, correct: 6, inputAnswered: 2, inputCorrect: 1,
    choiceLog: [1, 0, 1], inputLog: [1],
    q: { "sap-1": { a: 5, c: 3, k: 2, ck: 2 }, "sap-2": { a: 5, c: 3, k: 0, ck: 0 } },
    daily: { "2026-10-01": { a: 6, c: 4 }, "2026-10-02": { a: 4, c: 2 } },
  };
  const right = {
    answered: 8, correct: 7, inputAnswered: 5, inputCorrect: 4,
    choiceLog: [1, 1, 1, 0, 1], inputLog: [],
    q: { "sap-1": { a: 3, c: 3, k: 3, ck: 3 }, "sap-3": { a: 5, c: 4, k: 1, ck: 1 } },
    daily: { "2026-10-02": { a: 9, c: 8 }, "2026-10-03": { a: 1, c: 1 } },
  };

  test("totals は足さずに大きい方を取る（二重取り込みで倍にならない）", () => {
    const m = mergeStats(left, right);
    expect(m.answered).toBe(10);
    expect(m.correct).toBe(7);
    expect(m.inputAnswered).toBe(5);
    expect(m.inputCorrect).toBe(4);
  });

  test("q は和集合で、同じ問題は項目ごとに大きい方", () => {
    const m = mergeStats(left, right);
    expect(qSize(m)).toBe(3);
    expect(m.q["sap-1"].a).toBe(5);
    expect(m.q["sap-1"].k).toBe(3);
    expect(m.q["sap-3"].c).toBe(4);
  });

  test("daily は和集合で、同じ日は大きい方", () => {
    const m = mergeStats(left, right);
    expect(Object.keys(m.daily).length).toBe(3);
    expect(m.daily["2026-10-02"].a).toBe(9);
    expect(m.daily["2026-10-01"].a).toBe(6);
  });

  test("正誤ログは長い方が残る（推移グラフが縮まない）", () => {
    const m = mergeStats(left, right);
    expect(m.choiceLog.length).toBe(5);
    expect(m.inputLog.length).toBe(1);
  });

  test("同じものを二度混ぜても増えない", () => {
    const once = mergeStats(left, right);
    const twice = mergeStats(once, right);
    expect(twice.answered).toBe(once.answered);
    expect(qSize(twice)).toBe(qSize(once));
    expect(twice.choiceLog.length).toBe(once.choiceLog.length);
  });
});
