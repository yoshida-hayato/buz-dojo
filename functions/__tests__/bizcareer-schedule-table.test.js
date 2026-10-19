/**
 * ビジキャリの日程表そのものを見張る1枚。
 *
 * なぜ要るか:
 *   試験日の表は2つのファイルに別々に書かれている
 *   (js/screens-subjects.js の BIZCAREER_EXAM_DATES と
 *    functions/x-exam-notice.js の EXAM_DATES)。
 *   片方だけ延ばすと、サイトの注記と X の投稿が違う日を言う。
 *   ここが公式の表の写しの正本で、2つの定数がこれと1文字でも違えば落ちる。
 *
 * 出典 (2026-10-19 に中央職業能力開発協会の公式サイトで一次情報を確認。
 * 日程の一覧の頁と、受験申請の頁と、公式パンフレットの3つで一致した):
 *   令和8年度 前期 試験日 2026-10-04 / 受付 2026-04-20 から 2026-07-10
 *   令和8年度 後期 試験日 2027-02-14 / 受付 2026-10-05 から 2026-12-04
 *   令和9年度 前期 試験日 2027-10-03 / 受付期間は未公表 (後日ご案内)
 *   令和9年度 後期 試験日 2028-02-13 / 受付期間は未公表 (後日ご案内)
 *
 * 出典の頁のアドレスをここに素で書かない。パッチは Slack の本文で運ばれ、
 * ドメインに見える字面はリンク記法に化ける (この1件は最初その形で破棄された)。
 *
 * 日付で勝手に落ちるテストは置かない。見張るのは表の中身だけで、
 * 今日が何日かは見ない。表を書き替えたときだけ落ちる。
 */
const fs = require("fs");
const path = require("path");

const SCREENS = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "screens-subjects.js"),
  "utf8"
);
const NOTICE = fs.readFileSync(
  path.join(__dirname, "..", "x-exam-notice.js"),
  "utf8"
);

// 公式の表の写し。ここを直すときは出典の日付も直すこと
const OFFICIAL_EXAM_DATES = [
  "2026-10-04",
  "2027-02-14",
  "2027-10-03",
  "2028-02-13",
];
// 受付期間が公表されている期だけ。開始・終了・試験日の3つ組
const OFFICIAL_APPLICATION_PERIODS = [
  "2026-04-20", "2026-07-10", "2026-10-04",
  "2026-10-05", "2026-12-04", "2027-02-14",
];

/** src の中の定数宣言1本から ISO の暦日を順番どおりに取り出す */
function datesInConst(src, name) {
  const head = src.indexOf("const " + name);
  if (head < 0) return null;
  const open = src.indexOf("[", head);
  const close = src.indexOf("];", open);
  if (open < 0 || close < 0) return null;
  const found = src.slice(open, close).match(/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/g);
  return found === null ? [] : found;
}

describe("ビジキャリの日程表 (公式の写しの正本)", () => {
  test("サイト側の試験日が公式の表と一致する", () => {
    expect(datesInConst(SCREENS, "BIZCAREER_EXAM_DATES")).toEqual(
      OFFICIAL_EXAM_DATES
    );
  });

  test("X 側の試験日が公式の表と一致する", () => {
    expect(datesInConst(NOTICE, "EXAM_DATES")).toEqual(OFFICIAL_EXAM_DATES);
  });

  test("2つのファイルの試験日が互いに一致する", () => {
    expect(datesInConst(SCREENS, "BIZCAREER_EXAM_DATES")).toEqual(
      datesInConst(NOTICE, "EXAM_DATES")
    );
  });

  test("受付期間は公表済みの2期ぶんだけで、サイトと X で一致する", () => {
    const site = datesInConst(SCREENS, "BIZCAREER_APPLICATION_PERIODS");
    const x = datesInConst(NOTICE, "APPLICATION_PERIODS");
    expect(site).toEqual(OFFICIAL_APPLICATION_PERIODS);
    expect(x).toEqual(OFFICIAL_APPLICATION_PERIODS);
  });

  test("試験日は昇順に並んでいる", () => {
    const ds = datesInConst(SCREENS, "BIZCAREER_EXAM_DATES");
    for (let i = 1; i !== ds.length; i++) {
      expect(ds[i - 1].localeCompare(ds[i])).toBe(-1);
    }
  });

  test("受付期間つきの期は、試験日の表の先頭から同じ順で並ぶ", () => {
    const periods = datesInConst(SCREENS, "BIZCAREER_APPLICATION_PERIODS");
    const examOf = [];
    for (let i = 2; i !== periods.length + 2; i += 3) {
      if (periods[i] !== undefined) examOf.push(periods[i]);
    }
    const exams = datesInConst(SCREENS, "BIZCAREER_EXAM_DATES");
    expect(exams.slice(0, examOf.length)).toEqual(examOf);
  });

  test("受付期間が未公表の期が残っていることを控える", () => {
    // この数が0になったら、2027年度の受付期間が公表されて表に入ったということ。
    // そのときは OFFICIAL_APPLICATION_PERIODS を延ばし、この数の期待値を直す
    const exams = datesInConst(SCREENS, "BIZCAREER_EXAM_DATES").length;
    const withPeriod = datesInConst(SCREENS, "BIZCAREER_APPLICATION_PERIODS").length / 3;
    expect(exams - withPeriod).toBe(2);
  });
});
