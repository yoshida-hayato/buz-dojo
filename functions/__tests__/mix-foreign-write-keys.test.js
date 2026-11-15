// 他科目の控えの鍵が、科目が自分で名乗っている鍵と一致することの見張り。
//
// なぜ要るか (2026-11-15 18:48便 に実測)。書き分けの宛先は
// _knownSubjectStorageKey が決める。あれは8科目を手で並べた表を持ち、
// 表に無い科目は id の横棒を下棒に替えて鍵を組み立てる。いまの13科目は
// 13件とも導出と一致したが (機械で数えた)、これは手で保たれている
// 偶然である。鍵の形が1つだけ違う科目を足すと、その科目をミックスに
// 混ぜた答えは、誰も読まない孤児の鍵へ黙って溜まる。捨てるのと違って
// console にも理由が出ないので、気づく口が1つも無い。
//
// だから科目の側の正本 (subjects の各 subject.js) と導出を突き合わせる。
// 新しい科目を足した日に、ここが名指しで落ちる。
const fs = require("fs");
const path = require("path");

const H = require("../test-helpers/mix-write-store.js");
const ROOT = path.join(__dirname, "..", "..");
const SUBJECTS = path.join(ROOT, "subjects");
const DQ = String.fromCharCode(34);

// subject.js から storageKey の値を取り出す。正規表現は使わない
// (円記号がパッチの口を通らない)。
function keyIn(src) {
  const at = src.indexOf("storageKey:");
  if (at < 0) return null;
  const rest = src.slice(at);
  const open = rest.indexOf(DQ);
  if (open < 0) return null;
  const close = rest.indexOf(DQ, open + 1);
  if (close < 0) return null;
  return rest.slice(open + 1, close);
}

function subjectRows() {
  const out = [];
  fs.readdirSync(SUBJECTS).forEach((name) => {
    if (name.indexOf("_") === 0) return;
    const p = path.join(SUBJECTS, name, "subject.js");
    if (!fs.existsSync(p)) return;
    out.push({ id: name, key: keyIn(fs.readFileSync(p, "utf8")) });
  });
  return out;
}

test("道具そのものが拾えている (数えた結果が空ではない)", () => {
  const rows = subjectRows();
  expect(rows.length).toBeGreaterThan(9);
  rows.forEach((r) => {
    expect(typeof r.key).toBe("string");
    expect(r.key.length).toBeGreaterThan(10);
  });
});

test("科目が名乗る鍵と、書き分けが組み立てる鍵が一致する", () => {
  const S = H.makeStore("ap-kamoku-b");
  const bad = [];
  subjectRows().forEach((r) => {
    const derived = S._knownSubjectStorageKey(r.id);
    if (derived !== r.key) bad.push(r.id + " は " + r.key + " だが導出は " + derived);
  });
  expect(bad.join(" / ")).toBe("");
});

test("表に無い科目でも、鍵は空にならない", () => {
  const S = H.makeStore("ap-kamoku-b");
  expect(S._knownSubjectStorageKey("fe-kamoku-a").length).toBeGreaterThan(10);
  expect(S._knownSubjectStorageKey("")).toBe("");
});
