//
// 資格の帯に出す試験の注記のテスト。
//
// なぜ必要か: 2026-10-18 までは、ビジキャリの3科目のカードが同じ1文を
// それぞれ抱えていた。幅390の実測で1枚35px、3枚で105pxである。
// 2026-10-19 00:48便 に、これを帯の見出しの下に1本だけ出す形へ移した。
// カードは 245px から 204px になり、ほかの科目のカードと同じ高さに揃った。
//
// 帯の注記は「帯の先頭の科目」から取る。だから3科目の注記が同じ文である
// ことが前提になる。もし科目ごとに試験日が割れたら、先頭の1科目の文だけが
// 出て、残り2科目の事情は画面から消える。その日に気づけるよう、ここで
// 3科目の注記が一致することを機械に見させる。
//
// 日程表そのものも見張る。いまの表は2行しかなく、最後の試験日は
// 2027-02-14 である。この日を過ぎると、注記は二度と出ず、資格の帯は
// 既定の位置 (最後) に据わったままになる。表を書き替えるときは、
// この1件が落ちて、帯の振る舞いを思い出させる。
// 時限式にはしない。日付で勝手に落ちるテストを置くと、その日から
// すべてのパッチが道連れで破棄される。
//
// 添字で書いている箇所があるのは、Slack の自動リンクがドット記法を
// 書き換えるのを避けるため (パッチ経路)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (...rel) => fs.readFileSync(path.join(ROOT, ...rel), "utf8");
const SCREENS = read("js", "screens-subjects.js");
const SUBJECTS_CSS = read("css", "subjects.css");
const HTML = read("index.html");

const EXAM = ["biz-career", "biz-pm-planning", "biz-pm-operation"];

function ctxAt(nowIso) {
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
  const ctx = vm.createContext({ Date: FixedDate, Math, JSON, Intl, console, window: {} });
  vm.runInContext(read("subjects", "registry.js"), ctx, { filename: "registry" });
  vm.runInContext(SCREENS, ctx, { filename: "screens-subjects" });
  return ctx;
}

describe("3科目の試験の注記は同じ文である (帯に1本だけ出す前提)", () => {
  const dates = [
    "2026-10-19T12:00:00+09:00",
    "2026-11-15T12:00:00+09:00",
    "2026-12-04T12:00:00+09:00",
    "2026-12-20T12:00:00+09:00",
    "2027-01-20T12:00:00+09:00",
    "2027-02-14T12:00:00+09:00",
    "2027-02-15T12:00:00+09:00",
  ];
  for (const d of dates) {
    test("3科目が一致: " + d, () => {
      const ctx = ctxAt(d);
      const notes = EXAM.map((id) => ctx.subjectExamCountdownNote(id));
      expect(notes[1]).toBe(notes[0]);
      expect(notes[2]).toBe(notes[0]);
    });
  }

  test("受付期間中の文面と、試験日の文面", () => {
    expect(ctxAt("2026-10-19T12:00:00+09:00").subjectExamCountdownNote("biz-career")).toBe(
      "ビジキャリ申込受付中。申込は12/4まで、試験は2/14"
    );
    expect(ctxAt("2027-02-14T12:00:00+09:00").subjectExamCountdownNote("biz-career")).toBe(
      "本日がビジキャリ試験日です"
    );
  });

  test("ビジキャリ以外の科目は注記を出さない", () => {
    const ctx = ctxAt("2026-10-19T12:00:00+09:00");
    expect(ctx.subjectExamCountdownNote("sap")).toBe("");
    expect(ctx.subjectExamCountdownNote("outlook-mail")).toBe("");
    expect(ctx.subjectExamCountdownNote("excel-functions")).toBe("");
  });
});

describe("注記は帯に1本。カードは抱えない", () => {
  test("カードの組み立てから 1枚ずつの注記が外れている", () => {
    expect(SCREENS.indexOf("subjectExamCountdownHtml(s.id)")).toBe(-1);
  });

  test("帯の見出しの直後に注記を1本出している", () => {
    expect(SCREENS.indexOf("const bandNote =")).toBeGreaterThan(-1);
    expect(SCREENS.indexOf('noteEl.className = "subject-band-note"')).toBeGreaterThan(-1);
    // 見出しを作った直後に置くこと (間にカードが入らない)
    const head = SCREENS.indexOf('heading.className = "subject-tier-heading"');
    const note = SCREENS.indexOf("const bandNote =");
    const card = SCREENS.indexOf('card.className = "subject-card subject-card-wrap"');
    expect(head).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(head);
    expect(note).toBeLessThan(card);
  });

  test("見た目は最初に読む CSS に在る", () => {
    // index.html が静的に読むのは base と header と subjects の3枚だけ。
    // 後から読む CSS に書くと、初見の訪問者には素の文字で出る
    expect(SUBJECTS_CSS.indexOf(".subject-band-note")).toBeGreaterThan(-1);
    expect(HTML.indexOf('href="css/subjects.css"')).toBeGreaterThan(-1);
  });
});

describe("ビジキャリの日程表", () => {
  test("いまの表は2行で、最後の試験日は 2027-02-14", () => {
    // この1件が落ちたら、表を書き替えたということ。
    // そのときは、資格の帯の持ち上がりと、この注記の出方を見直すこと。
    // 最後の試験日を過ぎると注記は出なくなり、資格の帯は既定の位置に据わる
    expect(SCREENS.indexOf("{ since: '2026-04-20', until: '2026-07-10', examDate: '2026-10-04' }")).toBeGreaterThan(-1);
    expect(SCREENS.indexOf("{ since: '2026-10-05', until: '2026-12-04', examDate: '2027-02-14' }")).toBeGreaterThan(-1);
  });

  test("表が切れた後も画面は落ちず、注記が消えるだけ", () => {
    const ctx = ctxAt("2027-06-01T12:00:00+09:00");
    for (const id of EXAM) expect(ctx.subjectExamCountdownNote(id)).toBe("");
    expect(ctx.enabledSubjectsSorted().length).toBe(10);
  });
});
