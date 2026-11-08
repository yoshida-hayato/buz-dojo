// 「順番を見る検査」が死んでいないかを機械で見る見張り。
//
// なぜ要るか (2026-11-09 00:48便 に実測)。indexOf は見つからなければ -1 を
// 返す。-1 は何より小さいので、expect(at).toBeLessThan(other) だけで
// 順番を見ている検査は、見ている行が repo から消えたときに落ちない。
// 実際に exam-mode-wiring がこの形で2件死んでいた。日次枠の記録
// (Entitlement.recordAnswer) を丸ごと消しても、そのファイルの9件は
// 9件とも通った。無料20問の壁が効かなくなる経路が、検査の側から
// 見えなくなっていた。
//
// 同じ形は手で見つからない。だから字面を機械で走る。
// 見るのは1つだけ: indexOf の結果を入れた変数が、toBeLessThan の側だけで
// 使われていて、-1 を下から押さえる1行が無いもの。
// 円記号がパッチの口を通らないので、正規表現は1つも使わない。
const fs = require("fs");
const path = require("path");
const os = require("os");

const DIR = path.join(__dirname);
const NL = String.fromCharCode(10);
const FLOORS = [
  ".toBeGreaterThan(-1)",
  ".toBeGreaterThanOrEqual(0)",
  ".not.toBe(-1)",
];
const DANGER = ["toBeLessThan", "toBeLessThanOrEqual"];
const SAFE = [
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBe",
  "not",
  "toEqual",
];

// その位置を囲む test ブロックの本文を返す
function enclosing(src, at) {
  const head = src.lastIndexOf("test(", at);
  const start = head < 0 ? 0 : head;
  const tail = src.indexOf(NL + "});", at);
  return src.slice(start, tail < 0 ? src.length : tail);
}

// 変数名を宣言の行から取り出す。const 名前 = ... の形だけを見る
function nameOf(line) {
  const k = "const ";
  const at = line.indexOf(k);
  if (at < 0) return "";
  const rest = line.slice(at + k.length);
  const eq = rest.indexOf("=");
  if (eq < 0) return "";
  const name = rest.slice(0, eq).trim();
  if (!name || name.indexOf(" ") >= 0 || name.indexOf("{") >= 0) return "";
  return name;
}

// expect(名前). のあとに続く判定の名前を全部集める
function matchersFor(body, name) {
  const needle = "expect(" + name + ").";
  const out = [];
  let i = body.indexOf(needle);
  while (i >= 0) {
    const rest = body.slice(i + needle.length);
    const paren = rest.indexOf("(");
    out.push(paren < 0 ? rest.trim() : rest.slice(0, paren).trim());
    i = body.indexOf(needle, i + needle.length);
  }
  return out;
}

function scan(file, dir) {
  const src = fs.readFileSync(path.join(dir || DIR, file), "utf8");
  const found = [];
  const lines = src.split(NL);
  let offset = 0;
  for (const line of lines) {
    const at = offset;
    offset += line.length + 1;
    if (line.indexOf(".indexOf(") < 0) continue;
    const name = nameOf(line);
    if (!name) continue;
    const body = enclosing(src, at);
    const ms = matchersFor(body, name);
    if (ms.length === 0) continue;
    const floored = FLOORS.some(
      (f) => body.indexOf("expect(" + name + ")" + f) >= 0
    );
    if (floored) continue;
    const onlyDanger = ms.every((m) => DANGER.indexOf(m) >= 0);
    const known = ms.every(
      (m) => DANGER.indexOf(m) >= 0 || SAFE.indexOf(m) >= 0
    );
    if (onlyDanger && known) found.push(file + " > " + name);
  }
  return found;
}

const FILES = fs
  .readdirSync(DIR)
  .filter((f) => f.indexOf(".test.js") === f.length - 8);

test("順番を見る検査が、-1 を下から押さえている", () => {
  const dead = [];
  for (const f of FILES) {
    for (const d of scan(f)) dead.push(d);
  }
  expect(dead).toEqual([]);
});

test("この走査そのものが効いている (押さえの無い形を自分で作って捕まえる)", () => {
  // 検査の道具を疑う。偽の本文を作って、拾うことと拾わないことを両方見る
  const bad =
    "test(" +
    String.fromCharCode(34) +
    "偽" +
    String.fromCharCode(34) +
    ", () => {" +
    NL +
    "  const guardAt = SRC.indexOf(" +
    String.fromCharCode(34) +
    "a" +
    String.fromCharCode(34) +
    ");" +
    NL +
    "  const atX = SRC.indexOf(" +
    String.fromCharCode(34) +
    "b" +
    String.fromCharCode(34) +
    ");" +
    NL +
    "  expect(atX).toBeLessThan(guardAt);" +
    NL +
    "});" +
    NL;
  const good = bad.replace(
    "  expect(atX).toBeLessThan(guardAt);",
    "  expect(atX).toBeGreaterThan(-1);" + NL + "  expect(atX).toBeLessThan(guardAt);"
  );
  // 試験の置き場には書かない (そこに .test.js を作ると走る相手が増える)。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deadorder-"));
  const name = "probe.test.js";
  try {
    fs.writeFileSync(path.join(dir, name), bad, "utf8");
    expect(scan(name, dir).length).toBe(1);
    fs.writeFileSync(path.join(dir, name), good, "utf8");
    expect(scan(name, dir).length).toBe(0);
  } finally {
    fs.unlinkSync(path.join(dir, name));
    fs.rmdirSync(dir);
  }
});

test("走る相手が1枚ではない (走査の当たる範囲を数える)", () => {
  expect(FILES.length).toBeGreaterThan(80);
});
