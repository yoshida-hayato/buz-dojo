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

describe("normalizeStats の後方互換と掃除", () => {
  test("ck が無い古い行は、記述の試行が無ければ k から埋める", () => {
    const n = normalizeStats({ answered: 1, q: { "sap-1": { a: 3, c: 2, k: 2 } } });
    expect(n.q["sap-1"].ck).toBe(2);
  });

  test("ck が無く記述の試行がある行は、選択の習得を 0 にする", () => {
    const n = normalizeStats({ answered: 1, q: { "sap-1": { a: 3, k: 5, ia: 1 } } });
    expect(n.q["sap-1"].ck).toBe(0);
  });

  test("daily は日付の形でない鍵と、回答0の日を落とす", () => {
    const n = normalizeStats({
      answered: 1,
      daily: { "2026-10-01": { a: 2, c: 1 }, "10/1": { a: 9, c: 9 }, "2026-10-02": { a: 0, c: 0 } },
    });
    expect(Object.keys(n.daily).length).toBe(1);
    expect(n.daily["2026-10-01"].c).toBe(1);
  });

  test("choiceLog は 0 と 1 に正規化される", () => {
    const n = normalizeStats({ answered: 2, choiceLog: [true, false, 1, 0] });
    expect(n.choiceLog.join("")).toBe("1010");
  });

  test("壊れた入力は空の記録になる", () => {
    expect(normalizeStats(undefined).answered).toBe(0);
    expect(normalizeStats("x").answered).toBe(0);
    expect(qSize(emptyStats())).toBe(0);
  });
});

describe("statsChanged（書き込むかどうかの判定）", () => {
  test("q に新しい問題が増えたら真", () => {
    const before = normalizeStats({ answered: 1, q: { "sap-1": { a: 1 } } });
    const after = normalizeStats({ answered: 1, q: { "sap-1": { a: 1 }, "sap-2": { a: 1 } } });
    expect(statsChanged(before, after)).toBe(true);
  });

  test("同じ問題の試行回数が増えたら真", () => {
    const before = normalizeStats({ answered: 1, q: { "sap-1": { a: 1 } } });
    const after = normalizeStats({ answered: 1, q: { "sap-1": { a: 2 } } });
    expect(statsChanged(before, after)).toBe(true);
  });

  test("何も増えていなければ偽（無駄な書き込みをしない）", () => {
    const same = normalizeStats({ answered: 5, correct: 3, q: { "sap-1": { a: 5, c: 3 } } });
    expect(statsChanged(same, normalizeStats({ answered: 5, correct: 3, q: { "sap-1": { a: 5, c: 3 } } }))).toBe(false);
  });
});

describe("buildSummaryPayload（画面に出る数）", () => {
  const stats = normalizeStats({
    answered: 9, correct: 6, inputAnswered: 3, inputCorrect: 2,
    q: {
      "sap-1": { a: 3, c: 3, k: 2, ck: 2 },
      "sap-2": { a: 3, c: 1, k: 0, ck: 0 },
      "sap-3": { a: 3, c: 3, ia: 3, ic: 3, ik: 2 },
    },
    daily: { "2026-10-01": { a: 9, c: 6 } },
  });

  test("選択の習得は ck が2以上の問題の数", () => {
    expect(buildSummaryPayload(stats, "sap", "a@b.c").masteredChoice).toBe(1);
  });

  test("記述の習得は ik が2以上の問題の数", () => {
    expect(buildSummaryPayload(stats, "sap", "a@b.c").masteredInput).toBe(1);
  });

  test("科目とスキーマ版と宛先が入る", () => {
    const p = buildSummaryPayload(stats, "biz-career", null);
    expect(p.subjectId).toBe("biz-career");
    expect(p.schemaVersion).toBe(2);
    expect(p.email).toBeNull();
    expect(p.daily["2026-10-01"].a).toBe(9);
  });

  test("保存済みの習得数が大きければ、数え直しで減らさない", () => {
    const withSaved = { ...stats, masteredChoice: 7 };
    expect(buildSummaryPayload(withSaved, "sap", null).masteredChoice).toBe(7);
  });
});
