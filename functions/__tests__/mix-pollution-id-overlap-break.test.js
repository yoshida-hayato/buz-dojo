// 混入検出に入れた門が、本当に効いていることの確かめ。
//
// 字面が在るかを見るのではなく、その行を抜いた (あるいは素通りにした)
// storage.js を vm で実際に走らせて、結論が変わることを見る。
// 失敗の型7 (見張りを語が在るかで書く) と 型20 (壊したつもりで壊していない) の
// 対策である。壊し方が効いていないと「捕まらない」と出るので、
// 壊した字面が本当に減ったことも毎回測る。
const helper = require("../test-helpers/mix-pollution-store");

const STORAGE = helper.STORAGE;
const play = helper.play;
const wipedCount = helper.wipedCount;
const summaryOf = helper.summaryOf;
const counterOnlyCopy = helper.counterOnlyCopy;

// needle を to に書き替えた字面を返す。置換が本当に当たったことを測ってから返す
function rewrite(needle, to) {
  expect(STORAGE.indexOf(needle)).toBeGreaterThan(-1);
  const broken = STORAGE.split(needle).join(to);
  expect(broken).not.toBe(STORAGE);
  return broken;
}

const GATE_PAIR =
  "if (this._questionIdsProveNotCopy(candidate, sourceId, peersById)) return false;";
const GATE_NEAR =
  "if (this._questionIdsProveNotCopy(stats, peerId, peersById)) continue;";

test("写しの門を抜くと、並んで伸びた2科目で1科目が消える", () => {
  const broken = rewrite(GATE_PAIR, "");
  expect(wipedCount(400, false, broken)).toBe(1);
  // 対照: 門が在れば0件である
  expect(wipedCount(400, false)).toBe(0);
});

test("門を常に偽にしても消える (門が条件で効いていることの確かめ)", () => {
  const broken = rewrite(
    "if (overlap.shared > 0) return false;",
    "if (overlap.shared >= 0) return false;"
  );
  expect(wipedCount(400, false, broken)).toBe(1);
});

test("累計の検算を素通りにすると、累計だけの写しを見逃す", () => {
  const broken = rewrite("return this._countersExplainedByOwnQ(stats);", "return true;");
  expect(counterOnlyCopy(broken).verdict()).toBe(false);
  // 対照: 検算が在れば写しと判定する
  expect(counterOnlyCopy().verdict()).toBe(true);
});
