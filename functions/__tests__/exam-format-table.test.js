//
// 模試の試験形式の表 (config/exam-formats.js) のガード。
//
// なぜ要るか: この表は外の世界 (主催者の公表物) を写したもので、機械には
// 真偽を確かめさせられない。確かめさせられるのは「いつ・誰の公表を見たか」が
// 残っていることと、合否の線が1箇所から出ていることである。
//
// いちばん危ないのは、合否の判定が2箇所に分かれること。模試の面は
// 「24問以上で合格」と書き、結果の面は百分率を丸めて判定する — という形に
// なると、39問しか出なかった回などで表示と判定が1問ぶんずれる。だから
// passingCorrectCount と isPass が、全件で同じ境界を出すことを見張る。
//
// 正規表現は使わない (パッチ経路に量指定子を通せない)。
//
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ExamFormats = require(path.join(ROOT, "config", "exam-formats.js"));
const Pricing = require(path.join(ROOT, "config", "pricing.js"));

const WITH_EXAM = ["biz-career", "biz-pm-planning", "biz-pm-operation"];

test("形式を持つのはビジキャリの3科目だけで、どれも料金の正本に在る", () => {
  const ids = Object.keys(ExamFormats.EXAM_FORMATS).sort();
  expect(ids).toEqual(WITH_EXAM.slice().sort());
  const catalog = Pricing.SUBJECT_CATALOG;
  for (const id of ids) {
    expect(Object.prototype.hasOwnProperty.call(catalog, id)).toBe(true);
  }
});

test("形式を持たない科目には模試を出さない", () => {
  const all = Object.keys(Pricing.SUBJECT_CATALOG);
  const others = all.filter((id) => WITH_EXAM.indexOf(id) < 0);
  expect(others.length).toBeGreaterThan(0);
  for (const id of others) {
    expect(ExamFormats.hasExam(id)).toBe(false);
    expect(ExamFormats.formatFor(id)).toBe(null);
    expect(ExamFormats.timeLimitMs(id)).toBe(0);
    expect(ExamFormats.passedExam(id, 40, 40)).toBe(false);
    expect(ExamFormats.passingCorrectCount(id, 40)).toBe(0);
  }
  expect(ExamFormats.hasExam("")).toBe(false);
  expect(ExamFormats.formatFor(null)).toBe(null);
});

test("公表されている数字そのもの (5肢択一 / 40問 / 110分 / 概ね6割)", () => {
  for (const id of WITH_EXAM) {
    const f = ExamFormats.formatFor(id);
    expect(f.questionCount).toBe(40);
    expect(f.minutes).toBe(110);
    expect(f.passPercent).toBe(60);
    expect(f.choiceCount).toBe(5);
    expect(ExamFormats.timeLimitMs(id)).toBe(6600000);
  }
});

test("数字の出どころと確認した日が残っている", () => {
  for (const id of WITH_EXAM) {
    const f = ExamFormats.formatFor(id);
    expect(f.authority).toBe("中央職業能力開発協会");
    expect(f.confirmedOn).toBe("2026-10-19");
    expect(f.examName.indexOf("2級")).toBeGreaterThan(-1);
  }
});

test("合否の境界は正答数で決まる。ちょうど6割は合格", () => {
  expect(ExamFormats.passedExam("biz-career", 24, 40)).toBe(true);
  expect(ExamFormats.passedExam("biz-career", 23, 40)).toBe(false);
  expect(ExamFormats.passingCorrectCount("biz-career", 40)).toBe(24);
});

test("丸めで境界がずれない (出題数が40でない回も含めて全件で突き合わせる)", () => {
  for (let total = 1; total <= 120; total++) {
    const need = ExamFormats.passingCorrectCount("biz-career", total);
    for (let correct = 0; correct <= total; correct++) {
      const pass = ExamFormats.passedExam("biz-career", correct, total);
      expect(pass).toBe(correct >= need);
    }
  }
});

test("出題数0では合格にしない", () => {
  expect(ExamFormats.passedExam("biz-career", 0, 0)).toBe(false);
  expect(ExamFormats.passingCorrectCount("biz-career", 0)).toBe(0);
  expect(ExamFormats.isPass(5, 0, 60)).toBe(false);
});

test("残り時間は分と秒の2桁。負の値は 00:00 に丸める", () => {
  expect(ExamFormats.formatRemaining(6600000)).toBe("110:00");
  expect(ExamFormats.formatRemaining(299000)).toBe("04:59");
  expect(ExamFormats.formatRemaining(9400)).toBe("00:09");
  expect(ExamFormats.formatRemaining(0)).toBe("00:00");
  expect(ExamFormats.formatRemaining(-5000)).toBe("00:00");
  expect(ExamFormats.formatRemaining(null)).toBe("00:00");
});
