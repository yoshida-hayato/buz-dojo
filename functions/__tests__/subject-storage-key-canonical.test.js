//
// 科目ごとの成績キーが、宣言と引き当ての両方で同じ字になることを見張る。
//
// なぜ要るか (2026-11-14 12:48便 に実測)。成績キーは2つの道で決まる。
// 自分の科目を開くときは subject.js の storageKey をそのまま使い、
// 他科目を読むときは _knownSubjectStorageKey が id から引く。
// 後者は id のハイフンを下線に替えるが、前者は宣言をそのまま使う。
// いま13科目とも一致していて、一致は宣言が在るおかげで保たれている。
// 宣言を落とすと、自分の科目は生の id で鍵を作り、他科目から読むときは
// 下線の鍵を見るので、13科目のうち12科目で食い違う。
// 食い違っても例外は出ない。_loadFromKey は無い鍵に空の成績を返すので、
// 他科目の成績が「0問」として黙って読めてしまう。
// これは 11/9 の障害と同じ形である (無いものが、無いと言わずに空で返る)。
// 章進捗と節進捗も storageKey から導くので、守る価値はミックス出題だけではない。
//
// 正規表現を使わないのは、パッチの通り道が円記号を運べないからである。
//
const fs = require("fs");
const path = require("path");
const { runIn, readJs, NL } = require("../test-helpers/js-sandbox");

const ROOT = path.join(__dirname, "..", "..");
const Q = String.fromCharCode(34);

function subjectDirs() {
  return fs
    .readdirSync(path.join(ROOT, "subjects"))
    .filter((d) => d.charAt(0) !== "_")
    .filter((d) => fs.existsSync(path.join(ROOT, "subjects", d, "subject.js")));
}

// name: "値" の行から値を取る。行頭の空白は落とし、name で始まる行だけを見る
function fieldOf(src, name) {
  const lines = String(src).split(NL);
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t.indexOf(name + ":") !== 0) continue;
    const a = t.indexOf(Q);
    if (a < 0) continue;
    const b = t.indexOf(Q, a + 1);
    if (b < 0) continue;
    return t.slice(a + 1, b);
  }
  return null;
}

function declared(dir) {
  const src = fs.readFileSync(path.join(ROOT, "subjects", dir, "subject.js"), "utf8");
  return { id: fieldOf(src, "id"), key: fieldOf(src, "storageKey") };
}

function canonical(id) {
  return "biz_dojo_" + String(id).split("-").join("_") + "_stats_v1";
}

function storage() {
  return runIn([readJs("storage.js")], {}, "QuizStorage").taken;
}

describe("科目ごとの成績キー", () => {
  // 足場の自己点検。走査が本当に科目を見つけているか (失敗の型15)
  test("足場: 科目が13以上見つかり、どれも id を宣言している", () => {
    const dirs = subjectDirs();
    expect(dirs.length).toBeGreaterThanOrEqual(13);
    dirs.forEach((d) => expect(typeof declared(d).id).toBe("string"));
  });

  test("足場: 本物の QuizStorage を vm から受け取れている", () => {
    const s = storage();
    expect(typeof s).toBe("object");
    expect(typeof s._knownSubjectStorageKey).toBe("function");
  });

  test("どの科目も storageKey を宣言している", () => {
    const missing = subjectDirs().filter((d) => !declared(d).key);
    expect(missing).toEqual([]);
  });

  test("宣言した storageKey は、id から決まる正しい字と同じである", () => {
    const bad = subjectDirs()
      .map((d) => declared(d))
      .filter((x) => x.key !== canonical(x.id))
      .map((x) => x.id + " は " + x.key + " だが " + canonical(x.id) + " のはず");
    expect(bad).toEqual([]);
  });

  test("他科目を引く側も、宣言と同じ字を返す", () => {
    const s = storage();
    const bad = subjectDirs()
      .map((d) => declared(d))
      .filter((x) => s._knownSubjectStorageKey(x.id) !== x.key)
      .map((x) => x.id + ": 引き当て " + s._knownSubjectStorageKey(x.id) + " 対 宣言 " + x.key);
    expect(bad).toEqual([]);
  });

  test("storageKey は科目ごとに別の字である", () => {
    const keys = subjectDirs().map((d) => declared(d).key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  // 対照。引き当てが生の id を返すようになったら、自分の科目が書く鍵と
  // 食い違う。ここが崩れると、上の2件が通っていても他科目は空で読める
  test("引き当ては、ハイフンを下線に替えている", () => {
    const s = storage();
    const withHyphen = subjectDirs()
      .map((d) => declared(d).id)
      .filter((id) => id.indexOf("-") !== -1);
    expect(withHyphen.length).toBeGreaterThanOrEqual(10);
    withHyphen.forEach((id) => {
      expect(s._knownSubjectStorageKey(id).indexOf("-")).toBe(-1);
    });
  });
});
