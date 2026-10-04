//
// Xの毎日投稿に差し込むビジキャリの1行 (functions/x-exam-notice) の単体テスト。
// この1行は公開中のXアカウントの返信フッタに出る。同じ日程が js/screens-subjects
// にも別に写してあり、画面側だけが守られていた。片方だけ直した日に、サイトとXが
// 違う申込期限を言う。申込期限は取り返しがつかない。経緯は学習ログ 12:48便。
//
// 出典 (2026-10-04 に中央職業能力開発協会の令和8年度試験日程ページで確認):
//   前期 受付 2026-04-20 から 2026-07-10、試験日 2026-10-04
//   後期 受付 2026-10-05 から 2026-12-04、試験日 2027-02-14
//
const fs = require("fs");
const path = require("path");

const notice = require("../x-exam-notice");

const SCREENS = path.join(__dirname, "..", "..", "js", "screens-subjects.js");
const SCREENS_SRC = fs.readFileSync(SCREENS, "utf8");
const NOTICE_SRC = fs.readFileSync(path.join(__dirname, "..", "x-exam-notice.js"), "utf8");
const SEISAN_SRC = fs.readFileSync(path.join(__dirname, "..", "x-daily-seisan.js"), "utf8");
const SAP_SRC = fs.readFileSync(path.join(__dirname, "..", "x-daily-sap.js"), "utf8");

// 定数の宣言に書かれている暦日を並び順のまま字面から取り出す (vm では const が出ない)
function datesInConst(src, name) {
  const head = src.indexOf("const " + name);
  if (head === -1) return null;
  const open = src.indexOf("[", head);
  const close = src.indexOf("];", open);
  if (open === -1 || close === -1) return null;
  const found = src.slice(open, close).match(/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/g);
  return found === null ? [] : found;
}

function count(src, needle) {
  let n = 0;
  let i = src.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = src.indexOf(needle, i + 1);
  }
  return n;
}

// その日の正午(JST)の1行
function lineOn(isoDate) {
  return notice.examNoticeLine(new Date(isoDate + "T12:00:00+09:00"));
}

const ON_EXAM_DAY = "本日がビジキャリ試験日です";
const LATTER = "次回ビジキャリは2/14、申込は12/4まで";
const FORMER = "次回ビジキャリは10/4、申込は7/10まで";

describe("公式日程との突き合わせ (X側)", () => {
  test("試験日が公式と一致する", () => {
    expect(datesInConst(NOTICE_SRC, "EXAM_DATES")).toEqual(["2026-10-04", "2027-02-14"]);
  });

  test("申込受付期間が公式と一致する", () => {
    expect(datesInConst(NOTICE_SRC, "APPLICATION_PERIODS")).toEqual([
      "2026-04-20", "2026-07-10", "2026-10-04",
      "2026-10-05", "2026-12-04", "2027-02-14",
    ]);
  });

  test("期間の開始・終了・試験日の前後が崩れていない", () => {
    const d = datesInConst(NOTICE_SRC, "APPLICATION_PERIODS");
    for (let i = 0; i !== d.length; i += 3) {
      expect(d[i].localeCompare(d[i + 1])).toBe(-1);
      expect(d[i + 1].localeCompare(d[i + 2])).toBe(-1);
    }
  });
});

describe("サイトとXが同じ日程を言う (写しの照合)", () => {
  test("試験日の定数が2ファイルで一致する", () => {
    expect(datesInConst(NOTICE_SRC, "EXAM_DATES")).toEqual(
      datesInConst(SCREENS_SRC, "BIZCAREER_EXAM_DATES")
    );
  });

  test("申込受付期間の定数が2ファイルで一致する", () => {
    expect(datesInConst(NOTICE_SRC, "APPLICATION_PERIODS")).toEqual(
      datesInConst(SCREENS_SRC, "BIZCAREER_APPLICATION_PERIODS")
    );
  });

  test("カウントダウン開始の日数が2ファイルで一致する", () => {
    expect(notice.COUNTDOWN_MAX_DAYS).toBe(60);
    expect(count(SCREENS_SRC, "Math.min(days, 60)")).toBe(1);
  });
});

describe("前期から後期へ切り替わる前後の1行", () => {
  test("10-04 は試験当日", () => {
    expect(lineOn("2026-10-04")).toBe(ON_EXAM_DAY);
  });

  test("10-05 から後期の受付の案内に変わる", () => {
    expect(lineOn("2026-10-05")).toBe(LATTER);
  });

  test("受付の最終日 12-04 まで出る (両端を含む)", () => {
    expect(lineOn("2026-12-04")).toBe(LATTER);
  });

  test("翌日 12-05 は残り71日なので無言", () => {
    expect(lineOn("2026-12-05")).toBe(null);
  });

  test("12-15 は残り61日でまだ無言", () => {
    expect(lineOn("2026-12-15")).toBe(null);
  });

  test("12-16 から残り日数に変わる", () => {
    expect(lineOn("2026-12-16")).toBe("ビジキャリ試験まであと60日");
  });

  test("後期試験の前日は あと1日", () => {
    expect(lineOn("2027-02-13")).toBe("ビジキャリ試験まであと1日");
  });

  test("後期試験の当日", () => {
    expect(lineOn("2027-02-14")).toBe(ON_EXAM_DAY);
  });

  test("最後の試験日を過ぎたら無言 (令和9年度を足し忘れたら気づく)", () => {
    expect(lineOn("2027-02-15")).toBe(null);
  });
});

describe("前期ぶんの枝も残す", () => {
  test("受付の初日 04-20 から出る", () => {
    expect(lineOn("2026-04-20")).toBe(FORMER);
  });

  test("前日 04-19 は無言", () => {
    expect(lineOn("2026-04-19")).toBe(null);
  });

  test("受付の最終日 07-10 まで出る", () => {
    expect(lineOn("2026-07-10")).toBe(FORMER);
  });

  test("翌日 07-11 は残り85日なので無言", () => {
    expect(lineOn("2026-07-11")).toBe(null);
  });

  test("08-05 から残り日数に変わる", () => {
    expect(lineOn("2026-08-05")).toBe("ビジキャリ試験まであと60日");
  });
});

describe("日付の境目は JST で切れている", () => {
  test("JST の 23:59:59 はまだ試験当日", () => {
    expect(notice.examNoticeLine(new Date("2026-10-04T14:59:59Z"))).toBe(ON_EXAM_DAY);
  });

  test("その1秒後 (JST 翌日 0時) は受付の案内に変わる", () => {
    expect(notice.examNoticeLine(new Date("2026-10-04T15:00:00Z"))).toBe(LATTER);
  });

  test("ミリ秒の数値でも同じ結果になる", () => {
    expect(notice.examNoticeLine(new Date("2026-10-05T12:00:00+09:00").getTime())).toBe(LATTER);
  });
});

describe("この1行が現に投稿に入っている", () => {
  test("生産管理の返信フッタが1箇所だけ呼んでいる", () => {
    expect(count(SEISAN_SRC, "examNoticeLine()")).toBe(1);
  });

  test("1行を組み立てている", () => {
    expect(count(SEISAN_SRC, 'const head = notice ? notice + "\\n" : "";')).toBe(1);
  });

  test("その1行がフッタの先頭で返されている (返り値から落ちたら落ちる)", () => {
    expect(count(SEISAN_SRC, "return head + ")).toBe(1);
  });

  test("SAP側には差し込まない (意図した非対称)", () => {
    expect(count(SAP_SRC, "examNoticeLine")).toBe(0);
  });
});
