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

