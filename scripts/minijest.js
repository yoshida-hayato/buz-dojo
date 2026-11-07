// 最小のテストランナー。jest が入らない環境で functions/__tests__ を走らせる。
//
// なぜ要るか: この箱から npm のレジストリに出られない (2026-11-01 は proxy が
// CONNECT に 403、2026-11-07 は名前解決そのものが通らない)。だから jest は
// 入らない。社員は便ごとに同じランナーを書き直していた (10/31, 11/1 に2回、
// 11/2 に1回)。package.json は 11月から test:mini でこのファイルを指していたが、
// ファイル自体が置かれていなかった。ここに置いて、書き直しを終わらせる。
//
// 使い方: リポジトリの根で node scripts/minijest.js [名前の一部]
//   jest の pretest と同じく _dev/sync-shared.py を先に走らせる
//   (忘れると料金の写しが古いまま通る。2026-11-01 に実測した取りこぼし)。
//
// なぜ正規表現を1つも使わないか: この repo の変更は Slack のパッチの口を通り、
// その口は円記号 (バックスラッシュ) を字面として運べない。だから改行は
// String.fromCharCode(10) で組み、照合は indexOf と split で書く。
// 同じ理由でバッククォートとアスタリスクも1文字も使わない。
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const child = require("child_process");

const ROOT = path.join(__dirname, "..");
const NL = String.fromCharCode(10);
const TEST_DIR = path.join(ROOT, "functions", "__tests__");

// ---- 木を組む ----------------------------------------------------------
function newNode(label) {
  return { label: label, tests: [], kids: [], before: [], after: [], once: [], onceAfter: [] };
}
let rootNode = newNode("");
let cursor = rootNode;

function describe(label, fn) {
  const node = newNode(label);
  cursor.kids.push(node);
  const prev = cursor;
  cursor = node;
  try {
    fn();
  } finally {
    cursor = prev;
  }
}

function test(label, fn) {
  cursor.tests.push({ label: label, fn: fn });
}

// jest の test.each。表の1行が配列ならそのまま引数、そうでなければ1引数。
function each(table) {
  return function (label, fn) {
    table.forEach(function (row) {
      const args = Array.isArray(row) ? row : [row];
      cursor.tests.push({ label: fmtName(label, args), fn: function () { return fn.apply(null, args); } });
    });
  };
}
test.each = each;
describe.each = function (table) {
  return function (label, fn) {
    table.forEach(function (row) {
      const args = Array.isArray(row) ? row : [row];
      describe(fmtName(label, args), function () { fn.apply(null, args); });
    });
  };
};

// 名前の中の %s などを引数で埋める。正規表現を使わずに1文字ずつ見る。
function fmtName(label, args) {
  const marks = "sdifjop";
  let out = "";
  let ai = 0;
  for (let i = 0; i < label.length; i += 1) {
    const c = label.charAt(i);
    if (c === "%" && i + 1 < label.length) {
      const n = label.charAt(i + 1);
      if (n === "%") { out += "%"; i += 1; continue; }
      if (marks.indexOf(n) >= 0) {
        out += show(args[ai]);
        ai += 1;
        i += 1;
        continue;
      }
    }
    out += c;
  }
  return out;
}

function show(v) {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  let s;
  try {
    s = JSON.stringify(v);
  } catch (e) {
    s = String(v);
  }
  if (s === undefined) s = String(v);
  return s.length > 240 ? s.slice(0, 240) + "..." : s;
}

// ---- 比べる ------------------------------------------------------------
function eq(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a !== a && b !== b;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
    if (!eq(a[ka[i]], b[ka[i]])) return false;
  }
  return true;
}

function matchers(actual, no) {
  function assert(ok, what, want) {
    if (no ? !ok : ok) return;
