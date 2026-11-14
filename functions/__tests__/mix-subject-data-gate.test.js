//
// ミックス出題 第3段: 取得した本文を評価する前に門を通す / 取得だけの関数は
// 大域に1つも書かない。読む側の約束のうち、門と大域の2つをここに置く。
// 1枚を2枚に割ってあるのは、1通が5,000字に入らないためである。
//
const H = require("../test-helpers/mix-loader-sandbox.js");

const OPEN = "fe-kamoku-a";
const OTHERS = ["fe-kamoku-b", "ap-kamoku-b"];

describe("約束3: 取得した本文を評価する前に、頁かどうかを見る", () => {
  test("subject.js に頁が返ったら、評価せずに落ちる", async () => {
    const bag = H.load({ pageFor: ["/subjects/ap-kamoku-b/subject.js"] });
    let msg = "";
    try {
      await bag.api.loadSubjectData("ap-kamoku-b");
    } catch (e) {
      msg = String(e.message);
    }
    expect(msg.indexOf("頁") !== -1).toBe(true);
  });

  test("questions.js に頁が返ったら、評価せずに落ちる", async () => {
    const bag = H.load({ pageFor: ["/data/ap-kamoku-b/questions.js"] });
    let msg = "";
    try {
      await bag.api.loadSubjectData("ap-kamoku-b");
    } catch (e) {
      msg = String(e.message);
    }
    expect(msg.indexOf("頁") !== -1).toBe(true);
  });

  test("subject.js が取れなければ落ちる", async () => {
    const bag = H.load({ missing: ["/subjects/ap-kamoku-b/subject.js"] });
    let failed = false;
    try {
      await bag.api.loadSubjectData("ap-kamoku-b");
    } catch (e) {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});

describe("約束4: 取得だけの関数は、大域に1つも書かない", () => {
  test("fetchQuizBundle を直に呼んでも、14個が1つも動かない", async () => {
    const bag = H.load();
    await bag.api.loadSubject(OPEN);
    const before = H.snapshot(bag);
    const b = await bag.api.fetchQuizBundle("/data/ap-kamoku-b", "test");
    expect(b.quiz.length).toBe(100);
    expect(H.snapshot(bag)).toBe(before);
  });

  test("fetchSubjectDefinition を直に呼んでも、SUBJECT が動かない", async () => {
    const bag = H.load();
    await bag.api.loadSubject(OPEN);
    const s = await bag.api.fetchSubjectDefinition("/subjects/ap-kamoku-b", "test");
    expect(s.id).toBe("ap-kamoku-b");
    expect(bag.win.SUBJECT.id).toBe(OPEN);
  });

  test("包みの loadQuizBundle は、いままでどおり大域を立てる", async () => {
    const bag = H.load();
    const b = await bag.api.loadQuizBundle("/data/fe-kamoku-b", "test");
    expect(bag.win.QUIZ_DATA.length).toBe(100);
    expect(bag.win.QUIZ_DATA).toBe(b.quiz);
  });
});
