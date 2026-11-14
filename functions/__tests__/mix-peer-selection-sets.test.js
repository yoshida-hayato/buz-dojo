//
// ミックス出題 第3段: 開いていない科目の成績を、科目を切り替えずに読む。
//
// なぜ要るか。buildMixedPoolFrom は科目ごとに「習得済み」「間違えた」
// 「解いた」の集合を要る。いまの4つの一覧は this.stats.q しか見ないので、
// 開いている1科目ぶんしか作れない。useSubject で切り替える手は取れない
// (非同期でクラウドを読み直すうえ、開いている科目そのものが動く)。
//
// 規則の正本を _selectionSetsFrom 1つに寄せ、4つの一覧はその包みにした。
// selectionSetsFor は、端末の控えから別の科目の q を読んで同じ規則を当てる。
//
const H = require("../test-helpers/mix-pollution-store.js");

// 成績の形。a 挑戦 / c 正解 / k 連続正解 / ia 記述挑戦 / ik 記述連続正解
const PEER_Q = {
  "p-wrong": { a: 3, c: 1, k: 0, ia: 0, ik: 0 },
  "p-mastered": { a: 2, c: 2, k: 2, ia: 0, ik: 0 },
  "p-input": { a: 0, c: 0, k: 0, ia: 2, ik: 2 },
  "p-fresh": { a: 0, c: 0, k: 0, ia: 0, ik: 0 },
};
const OWN_Q = { "o-wrong": { a: 4, c: 1, k: 0, ia: 0, ik: 0 } };

function withPeer() {
  const empty = H.makeStore("fe-kamoku-b", {})._empty();
  const peerStats = Object.assign({}, empty, { q: PEER_Q });
  const map = {};
  map[H.KEY_APB] = peerStats;
  const S = H.makeStore("fe-kamoku-b", map);
  S.stats.q = OWN_Q;
  return S;
}

describe("約束1: 別の科目の集合を、開いている科目を動かさずに読む", () => {
  test("他科目の4つの集合が、その科目の成績から出る", () => {
    const S = withPeer();
    const sets = S.selectionSetsFor("ap-kamoku-b");
    expect([...sets.wrongIds]).toEqual(["p-wrong"]);
    expect([...sets.choiceMastered]).toEqual(["p-mastered"]);
    expect([...sets.inputMastered]).toEqual(["p-input"]);
    expect([...sets.answeredIds].sort()).toEqual(["p-input", "p-mastered", "p-wrong"]);
  });

  test("読んだあとも、開いている科目と自分の成績が動かない", () => {
    const S = withPeer();
    S.selectionSetsFor("ap-kamoku-b");
    S.selectionSetsFor("sap");
    expect(S.subjectId).toBe("fe-kamoku-b");
    expect(Object.keys(S.stats.q)).toEqual(["o-wrong"]);
  });

  test("開いている科目を頼んだときは、控えではなく手元の成績を見る", () => {
    const S = withPeer();
    const sets = S.selectionSetsFor("fe-kamoku-b");
    expect([...sets.wrongIds]).toEqual(["o-wrong"]);
    // 他科目の id は1件も混ざらない
    expect([...sets.answeredIds].filter((id) => id.indexOf("p-") === 0).length).toBe(0);
  });

  test("控えが無い科目は、空の4つを返す (例外にしない)", () => {
    const S = withPeer();
    const sets = S.selectionSetsFor("no-such-subject");
    expect([...sets.answeredIds]).toEqual([]);
    expect([...sets.wrongIds]).toEqual([]);
    const none = S.selectionSetsFor("");
    expect([...none.answeredIds]).toEqual([]);
  });
});

describe("約束2: 規則の正本は1つで、4つの一覧はその包みである", () => {
  test("4つの一覧が、同じ成績から同じ顔ぶれを返す", () => {
    const S = withPeer();
    S.stats.q = PEER_Q;
    const sets = S._selectionSetsFrom(PEER_Q);
    expect(S.wrongIds().sort()).toEqual([...sets.wrongIds].sort());
    expect(S.answeredIds().sort()).toEqual([...sets.answeredIds].sort());
    expect(S.choiceMasteredIds().sort()).toEqual([...sets.choiceMastered].sort());
    expect(S.inputMasteredIds().sort()).toEqual([...sets.inputMastered].sort());
    expect(S.masteredIds().sort()).toEqual([...sets.choiceMastered].sort());
  });

  test("壊れた成績でも落ちない", () => {
    const S = withPeer();
    const broken = { ok: { a: 2, c: 0, k: 0 }, nil: null, str: "成績ではない字" };
    const sets = S._selectionSetsFrom(broken);
    expect([...sets.wrongIds]).toEqual(["ok"]);
    expect([...S._selectionSetsFrom(null).answeredIds]).toEqual([]);
    expect([...S._selectionSetsFrom("成績ではない字").answeredIds]).toEqual([]);
  });

  test("規則の中身: 連続正解2で習得、挑戦が正解より多ければ誤答", () => {
    // 包みの側ではなく、規則そのものを名指しで見る
    const S = withPeer();
    const q = {
      "k1": { a: 1, c: 1, k: 1 },
      "k2": { a: 2, c: 2, k: 2 },
      "ik1": { a: 0, c: 0, k: 0, ia: 1, ik: 1 },
      "ik2": { a: 0, c: 0, k: 0, ia: 2, ik: 2 },
      "same": { a: 2, c: 2, k: 0 },
      "more": { a: 3, c: 2, k: 0 },
    };
    const sets = S._selectionSetsFrom(q);
    expect([...sets.choiceMastered]).toEqual(["k2"]);
    expect([...sets.inputMastered]).toEqual(["ik2"]);
    expect([...sets.wrongIds]).toEqual(["more"]);
  });
});
