//
// ミックス出題 第3段: 開いている科目を動かさずに、別の科目を読む。
//
// なぜ要るか (2026-11-15 に実測)。loadSubject は科目を1本読むたびに
// SUBJECT / QUIZ_DATA / CHANGELOG / 選択中の科目 / loadedId の5つを動かす。
// ミックスで12科目を順に読ませると、利用者が選んでいた科目が最後の1本に
// 置き換わる。次に開いたとき、選んだ覚えの無い科目が開く。
// しかも大域は1科目ぶんしか無いので、読んだ先から前の科目が消える。
//
// loadSubjectData は、取得と評価だけをして束を返す。見るのはそこである。
//
const H = require("../test-helpers/mix-loader-sandbox.js");

const OPEN = "fe-kamoku-a";
const OTHERS = ["fe-kamoku-b", "ap-kamoku-b"];

describe("約束1: 別の科目を読んでも、開いている科目が1つも動かない", () => {
  test("2本読んでも、見張る14個が1つも動かない", async () => {
    const bag = H.load();
    await bag.api.loadSubject(OPEN);
    const before = H.snapshot(bag);
    for (const id of OTHERS) {
      await bag.api.loadSubjectData(id);
    }
    expect(H.snapshot(bag)).toBe(before);
  });

  test("同じ2本を loadSubject で読むと、現に動く (足場が動きを拾える)", async () => {
    // 足場の自己試験。これが無いと、約束1 は「何も測っていない」でも通る
    const bag = H.load();
    await bag.api.loadSubject(OPEN);
    const before = H.snapshot(bag);
    await bag.api.loadSubject(OTHERS[0]);
    expect(H.snapshot(bag)).not.toBe(before);
  });

  test("選択中の科目も loadedId も、開いた科目のままである", async () => {
    const bag = H.load();
    await bag.api.loadSubject(OPEN);
    for (const id of OTHERS) {
      await bag.api.loadSubjectData(id);
    }
    expect(bag.win.localStorage.getItem("biz_dojo_selected_subject")).toBe(OPEN);
    expect(bag.api.getLoadedId()).toBe(OPEN);
    expect(bag.win.SUBJECT.id).toBe(OPEN);
  });
});

describe("約束2: 読んだ束は科目ごとに別物で、同時に持てる", () => {
  test("3科目ぶんの問題を同時に手元に持てる", async () => {
    const bag = H.load();
    await bag.api.loadSubject(OPEN);
    const held = [];
    for (const id of OTHERS) {
      const d = await bag.api.loadSubjectData(id);
      held.push(d);
    }
    expect(held.length).toBe(2);
    expect(held[0].meta.id).toBe("fe-kamoku-b");
    expect(held[1].meta.id).toBe("ap-kamoku-b");
    // 大域の1本と、手元の2本が別の配列である
    const total = bag.win.QUIZ_DATA.length + held[0].quiz.length + held[1].quiz.length;
    expect(total).toBe(246);
    expect(held[0].quiz.length).toBe(100);
    expect(held[1].quiz.length).toBe(100);
    expect(bag.win.QUIZ_DATA.length).toBe(46);
  });

  test("束は科目ごとの subject 定義も持つ", async () => {
    const bag = H.load();
    const d = await bag.api.loadSubjectData("ap-kamoku-b");
    expect(d.subject.id).toBe("ap-kamoku-b");
    expect(typeof d.subject.storageKey).toBe("string");
    expect(d.contentBase.length > 0).toBe(true);
  });

  test("問題 id が科目をまたいで重なっていない", async () => {
    const bag = H.load();
    const a = await bag.api.loadSubjectData("fe-kamoku-b");
    const b = await bag.api.loadSubjectData("ap-kamoku-b");
    const seen = new Set(a.quiz.map((q) => q.id));
    const dup = b.quiz.filter((q) => seen.has(q.id));
    expect(dup.length).toBe(0);
  });

  test("知らない科目は名指しで落ちる", async () => {
    const bag = H.load();
    let msg = "";
    try {
      await bag.api.loadSubjectData("no-such-subject");
    } catch (e) {
      msg = String(e.message);
    }
    expect(msg.indexOf("no-such-subject") !== -1).toBe(true);
  });
});
