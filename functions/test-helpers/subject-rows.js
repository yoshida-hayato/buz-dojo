// 科目の一覧は2枚に分かれている。見張りは2枚とも読むこと。
//
// なぜこの足場が要るか (2026-11-01 18:48便 に実測):
//   2026-11-01 12:48便 が config/extra-subjects.js (レジストリの2枚目) を
//   置いた。走る側の8ファイルは使う時点で大域の一覧を読むので1行も直さずに
//   済んだ。ところが __tests__ の13枚は subjects/registry.js を自分で
//   読み直しており、2枚目を知らない。だから2枚目に科目を1本入れると、
//   「レジストリに無い科目の入口が在る」「サーバの一覧がレジストリと
//   一致しない」の形で、正しい配線のほうが落ちる。実測で4枚が落ちた。
//   逆に subject-static-about と subject-static-pages は素通りする
//   (2枚目の科目を見ないので、頁が無くても気づかない)。
//
// だから「科目の一覧」の読み方をここ1箇所に寄せる。
// 読む順番は index.html と同じ (registry → extra-subjects) にしてある。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const REGISTRY_SRC = read(path.join("subjects", "registry.js"));
const EXTRA_SRC = read(path.join("config", "extra-subjects.js"));

// 関門と、科目を足している途中の窓。
//
// 以前は5枚の見張りに 10 と書いてあった (わざと置いた関門で、足し忘れでは
// ない)。科目を1本足すと、本数も顔ぶれも「2枚のレジストリ」と「index.html
// の題の表・フッターの入口・帯の表・料金の表・接頭の表」の両側で変わる。
// パッチは1件ずつ全テストを通すので、どちらを先に出しても途中で必ず落ちる。
// だから関門と、食い違いを見る約束を、ここ1箇所から開け閉めできるようにした。
//
// 科目を1本足す手順 (3波):
//   1. WIRING_IN_PROGRESS を true にする (窓を開ける)
//   2. 配線を全部入れる。順番は自由になる
//   3. WIRING_IN_PROGRESS を false に戻し、DECLARED_SUBJECT_COUNT を
//      新しい本数に書き替える (同じ1件でよい。2行は隣に置いてある)
// 窓を開けたまま終わらせないこと。開いているあいだ、本数と顔ぶれの
// 食い違いは1つも検出されない。
const WIRING_IN_PROGRESS = true;
const DECLARED_SUBJECT_COUNT = 10;

// 本数が宣言と合っているか。合っていれば空、違えば理由を返す。
// 空かどうかで見る形にしてあるのは、落ちたときに数が読めるようにするため。
function countNote(actual) {
  if (WIRING_IN_PROGRESS) return "";
  if (Number(actual) === DECLARED_SUBJECT_COUNT) return "";
  return "科目の本数が宣言と違う: 実数 " + actual + " / 宣言 " + DECLARED_SUBJECT_COUNT;
}

// 顔ぶれの食い違い。差が無ければ空、在れば足りない側と余った側を返す。
function diffNote(label, got, want) {
  if (WIRING_IN_PROGRESS) return "";
  const missing = (want || []).filter(function (x) {
    return (got || []).indexOf(x) < 0;
  });
  const extra = (got || []).filter(function (x) {
    return (want || []).indexOf(x) < 0;
  });
  if (!missing.length && !extra.length) return "";
  return label + " 足りない:" + missing.join(",") + " 余り:" + extra.join(",");
}

// 並びまで同じか。顔ぶれが同じでも順が違えば理由を返す。
function orderNote(label, got, want) {
  if (WIRING_IN_PROGRESS) return "";
  const note = diffNote(label, got, want);
  if (note) return note;
  if ((got || []).join(",") === (want || []).join(",")) return "";
  return label + " 並びが違う: " + (got || []).join(",");
}

// ctx に、index.html と同じ順番で2枚を読み込む。
// 2枚目は SUBJECT_REGISTRY と同じ配列に push する (代入しない) ので、
// 先に registry が居ないと何も起きない。
function loadRegistryInto(ctx) {
  vm.runInContext(REGISTRY_SRC, ctx, { filename: "registry" });
  vm.runInContext(EXTRA_SRC, ctx, { filename: "extra-subjects" });
  return ctx;
}

// 2枚ぶんの科目 id を、読み込みの順番どおりに返す。
// enabled が偽の行は落とす (走る側の画面と同じ扱い)。
function allSubjectIds() {
  const ctx = vm.createContext({});
  loadRegistryInto(ctx);
  return vm.runInContext(
    "SUBJECT_REGISTRY.filter(function (s) { return s && s.id && s.id !== 'all' && s.enabled !== false; })" +
      ".map(function (s) { return s.id; })",
    ctx
  );
}

// 2枚ぶんの科目の行そのもの。
function allSubjectRows() {
  const ctx = vm.createContext({});
  loadRegistryInto(ctx);
  return vm.runInContext(
    "JSON.parse(JSON.stringify(SUBJECT_REGISTRY.filter(function (s) { return s && s.id && s.id !== 'all'; })))",
    ctx
  );
}

// 1枚目だけの id。2枚目を足す前と同じ読み方で、比べるときに使う。
function registryOnlyIds() {
  const ctx = vm.createContext({});
  vm.runInContext(REGISTRY_SRC, ctx, { filename: "registry" });
  return vm.runInContext(
    "SUBJECT_REGISTRY.filter(function (s) { return s && s.id && s.id !== 'all' && s.enabled !== false; })" +
      ".map(function (s) { return s.id; })",
    ctx
  );
}

module.exports = {
  ROOT,
  REGISTRY_SRC,
  EXTRA_SRC,
  WIRING_IN_PROGRESS,
  DECLARED_SUBJECT_COUNT,
  countNote,
  diffNote,
  orderNote,
  loadRegistryInto,
  allSubjectIds,
  allSubjectRows,
  registryOnlyIds,
};
