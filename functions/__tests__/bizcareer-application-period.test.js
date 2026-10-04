//
// ビジキャリの申込受付期間の表示の単体テスト。
//
// なぜ必要か: この注記は 2026-10-05 から公開サイトのカードに出る。
// 中身は公式の日程をコードに写した定数で、写し間違いは画面に出るまで
// 誰も気づかない。試験の申込期限は取り返しがつかないので、
// 定数そのものを機械に見張らせる。
//
// 出典 (2026-10-04 に中央職業能力開発協会の令和8年度試験日程ページで確認):
//   前期 受験申請受付 令和8年4月20日(月) から 令和8年7月10日(金)、試験日 令和8年10月4日(日)
//   後期 受験申請受付 令和8年10月5日(月) から 令和8年12月4日(金)、試験日 令和9年2月14日(日)
//   令和8年 = 2026年、令和9年 = 2027年
//
// 読み込み方は exam-countdown.test.js と同じ。js/screens-subjects.js を
// vm の素のコンテキストに評価し、トップレベルの関数宣言を取り出す。
// const はコンテキストに現れないので、定数はファイルの字面から読む。
// 時刻は固定した Date をコンテキストに渡して止める。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = path.join(__dirname, "..", "..", "js", "screens-subjects.js");
const SRC = fs.readFileSync(SOURCE, "utf8");

// 指定の時刻に固定したコンテキストで screens-subjects.js を評価する
function loadAt(nowIso) {
  const fixed = new Date(nowIso).getTime();
  class FixedDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  }
  const ctx = vm.createContext({
    Date: FixedDate,
    Math,
    JSON,
    Intl,
    console,
    window: {},
  });
  vm.runInContext(SRC, ctx, { filename: "screens-subjects.js" });
  return ctx;
}

// その日の正午(JST)のカードの注記
function noteOn(isoDate, subjectId) {
  const ctx = loadAt(isoDate + "T12:00:00+09:00");
  return ctx.subjectExamCountdownNote(subjectId || "biz-career");
}

// 素の文字列から、定数の宣言に書かれている暦日を並び順のまま取り出す
function datesInConst(name) {
  const head = SRC.indexOf("const " + name);
  if (head < 0) return null;
  const open = SRC.indexOf("[", head);
  const close = SRC.indexOf("];", open);
  if (open < 0 || close < 0) return null;
  const body = SRC.slice(open, close);
  const found = body.match(/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/g);
  return found === null ? [] : found;
}

describe("公式の日程と定数が一致している", () => {
  // vm のコンテキストからは関数宣言しか取り出せない (const は出てこない)。
  // だからここは評価結果ではなく、ファイルの字面を読んで突き合わせる。
  // 画面の文言ではなく定数そのものを見るので、写し間違いが1文字でも落ちる。
  test("申込受付期間の定数が公式の2期ぶんと一致する", () => {
    expect(datesInConst("BIZCAREER_APPLICATION_PERIODS")).toEqual([
      "2026-04-20", "2026-07-10", "2026-10-04",
      "2026-10-05", "2026-12-04", "2027-02-14",
    ]);
  });

  test("試験日の定数が公式の2期ぶんと一致する", () => {
    expect(datesInConst("BIZCAREER_EXAM_DATES")).toEqual([
      "2026-10-04", "2027-02-14",
    ]);
  });

  test("2つの定数が同じ試験日を指している", () => {
    const periods = datesInConst("BIZCAREER_APPLICATION_PERIODS");
    const examOf = [periods[2], periods[5]];
    expect(datesInConst("BIZCAREER_EXAM_DATES")).toEqual(examOf);
  });

  test("どの期間も開始が終了より前で、終了が試験日より前", () => {
    const d = datesInConst("BIZCAREER_APPLICATION_PERIODS");
    for (let i = 0; i !== d.length; i += 3) {
      expect(d[i] < d[i + 1]).toBe(true);
      expect(d[i + 1] < d[i + 2]).toBe(true);
    }
  });
});

describe("受付期間の両端 (後期)", () => {
  test("開始の前日は何も出さない", () => {
    expect(noteOn("2026-10-03")).toBe("ビジキャリ試験まであと1日");
  });

  test("試験当日は申込の案内より試験日の案内が勝つ", () => {
    expect(noteOn("2026-10-04")).toBe("本日がビジキャリ試験日です");
  });

  test("開始の当日から受付中が出る", () => {
    expect(noteOn("2026-10-05")).toBe(
      "ビジキャリ申込受付中。申込は12/4まで、試験は2/14"
    );
  });

  test("終了の当日まで出る (両端を含む)", () => {
    expect(noteOn("2026-12-04")).toContain("申込は12/4まで");
  });

  test("終了の翌日は何も出さない (試験まで71日なので無言)", () => {
    expect(noteOn("2026-12-05")).toBe("");
  });

  test("60日前から残り日数に切り替わる", () => {
    expect(noteOn("2026-12-16")).toBe("ビジキャリ試験まであと60日");
  });
});

describe("受付期間の両端 (前期)", () => {
  test("開始の前日は何も出さない", () => {
    expect(noteOn("2026-04-19")).toBe("");
  });

  test("開始の当日から受付中が出る", () => {
    expect(noteOn("2026-04-20")).toBe(
      "ビジキャリ申込受付中。申込は7/10まで、試験は10/4"
    );
  });

  test("終了の当日まで出る", () => {
    expect(noteOn("2026-07-10")).toContain("申込は7/10まで");
  });

  test("終了の翌日は何も出さない", () => {
    expect(noteOn("2026-07-11")).toBe("");
  });
});

describe("対象の科目", () => {
  test("生産管理系の3科目に出る", () => {
    for (const id of ["biz-career", "biz-pm-planning", "biz-pm-operation"]) {
      expect(noteOn("2026-10-05", id)).toContain("申込受付中");
    }
  });

  test("ほかの科目には何も出さない", () => {
    for (const id of ["sap", "excel", "outlook", "teams", "windows"]) {
      expect(noteOn("2026-10-05", id)).toBe("");
    }
  });
});

describe("一年を通して壊れた字面を出さない", () => {
  // 定数の足し忘れや日付の計算違いは、負の残り日数や NaN として画面に出る。
  // 2026-04-01 から 2027-03-31 までの全日を1日ずつ見る。
  test("365日ぶんの注記に負の数も NaN も出ない", () => {
    const bad = [];
    let ms = Date.UTC(2026, 3, 1);
    for (let i = 0; i !== 365; i++) {
      const iso = new Date(ms).toISOString().slice(0, 10);
      ms += 86400000;
      const note = noteOn(iso);
      if (note.indexOf("あと-") >= 0) bad.push([iso, note]);
      if (note.indexOf("NaN") >= 0) bad.push([iso, note]);
      if (note.indexOf("undefined") >= 0) bad.push([iso, note]);
    }
    expect(bad).toEqual([]);
  });

  test("注記が出る日と出ない日の数が想定どおり", () => {
    let spoken = 0;
    let ms = Date.UTC(2026, 3, 1);
    for (let i = 0; i !== 365; i++) {
      if (noteOn(new Date(ms).toISOString().slice(0, 10)) !== "") spoken += 1;
      ms += 86400000;
    }
    // 前期の受付82日 + 前期の60日前から当日まで61日
    // + 後期の受付61日 + 後期の60日前から当日まで61日 = 265日
    expect(spoken).toBe(265);
  });
});
