// PATCH_V1 の payload を、Slack の口に通す前に機械で検査する。
//
// なぜ要るか。引き継ぎメモの パッチの書き方 は135行あり、全部が
// 「この字面を入れたら1件落ちた」の記録である。1便10件から20件を手で
// 見るのは、毎便やる検査としては当たらない。確実に分かっている規則だけを
// ここに写して、機械に見させる。
//
// 規則は2段に分ける。
//   NG: 実測で1件以上落ちた形。入れたら必ず直すこと
//   注意: 落ちた前例が在るが、無傷で通った前例も在る形。自分で判断する
//
// 検出する字面は、この台本の中に素のままでは書かない。書くと、この台本を
// パッチで運ぶときに同じ変換の対象になる (slack-autolink-guard と同じ作法)。
// 正規表現は1つも使わない。円記号がこの口を通らないので、indexOf と split で組む。

const BT = String.fromCharCode(96);
const AST = String.fromCharCode(42);
const BS = String.fromCharCode(92);
const LT = String.fromCharCode(60);
const AT = String.fromCharCode(64);
const AMP = String.fromCharCode(38);
const NL = String.fromCharCode(10);
const SCHEME = "http" + String.fromCharCode(58) + "//";
const SCHEME_S = "https" + String.fromCharCode(58) + "//";

const EDITABLE = [
  ".js", ".css", ".html", ".md", ".py", ".json", ".rules", ".yml", ".yaml",
];
const BLOCKED_PREFIX = [".github/", "scripts/bridge/", "src/data/", "marketing/"];
const MAX_LINES = 200;

// 語とドットと実在 TLD の組。落ちた前例は 2文字と inc で、
// 無傷に通った前例は q.id である。だから NG ではなく 注意 にする。
const TLD_HINTS = [
  "it", "or", "jp", "inc", "com", "net", "org", "io", "co", "ai", "sh",
  "tv", "cc", "me", "app", "dev", "link", "live", "run", "zone", "top",
  "xyz", "site", "page", "click", "cloud", "today", "news", "blog", "wiki",
];
// 一覧に入れていない TLD は、無傷に通った前例が在るものである。
// 2文字でも .id は通った (rank-consistency の q.id が main に無傷で在る)。
// 落ちた前例だけを一覧に入れる。増やすときは、落ちた実例を添えること。

function countOf(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function lineCount(text) {
  return text.split(NL).length;
}

// 「語とドットと TLD」に見える塊を拾う。英数と記号の境目で切るだけ。
function domainish(text) {
  const WORD = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.";
  const out = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (WORD.indexOf(ch) >= 0) {
      buf += ch;
      continue;
    }
    if (buf) out.push(buf);
    buf = "";
  }
  if (buf) out.push(buf);
  const hits = [];
  for (const tok of out) {
    const parts = tok.split(".");
    if (parts.length < 2) continue;
    const tld = parts[parts.length - 1].toLowerCase();
    const head = parts[parts.length - 2];
    if (!head || TLD_HINTS.indexOf(tld) < 0) continue;
    const frag = head + "." + parts[parts.length - 1];
    if (hits.indexOf(frag) < 0) hits.push(frag);
  }
  return hits;
}

function headingTags(text) {
  const hits = [];
  for (let i = 1; i <= 6; i++) {
    for (const form of [LT + "h" + i, LT + "/h" + i]) {
      if (text.indexOf(form) >= 0 && hits.indexOf("h" + i) < 0) hits.push("h" + i);
    }
  }
  return hits;
}

function escapeProblems(text) {
  const out = [];
  if (text.indexOf(BS + BS) >= 0) {
    out.push("円記号を2つ重ねている (Slack が送信時に1つに畳む)");
  }
  const parts = text.split(BS);
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i].charAt(0);
    if (next === "n" || next === '"' || next === "" || next === BS) continue;
    out.push("円記号のエスケープ " + BS + next + " が在る (改行の n と引用符だけ通る)");
  }
  return out;
}

// payload の生の字面 (JSON のまま) を見る。
function lintText(text) {
  const ng = [];
  const warn = [];
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ng: ["JSON を解けない: " + e.message], warn: [], title: "" };
  }
  const nbt = countOf(text, BT);
  if (nbt > 0) ng.push("バッククォートが " + nbt + "個 在る (囲みが壊れる)");
  const nast = countOf(text, AST);
  if (nast > 1) ng.push("アスタリスクが " + nast + "個 在る (1通に1個まで)");
  escapeProblems(text).forEach((m) => ng.push(m));
  // ユニコードエスケープ (円記号と u と4桁) は、上の円記号の規則が拾う。
  // Slack は送信時にほどくので、ほどけた後の素の記号を探しても遅い。
  // 実体参照は、この台本の中に素で書けない (書くと台本自身が化ける) ので
  // アンパサンドをコード点から組む。
  for (const name of ["lt", "gt", "amp", "quot"]) {
    const ent = AMP + name + String.fromCharCode(59);
    if (text.indexOf(ent) >= 0) {
      ng.push("実体参照 " + name + " が在る (ブリッジの unescape 1回では戻らない)");
    }
  }
  if (text.indexOf(AT) >= 0) ng.push("アットマークが在る (メールの形に化ける)");
  if (text.indexOf(SCHEME) >= 0 || text.indexOf(SCHEME_S) >= 0) {
    ng.push("スキームが在る (URL はリンク記法に化ける)");
  }
  headingTags(text).forEach((h) => ng.push("見出しタグ " + h + " を素で書いている"));
  domainish(text).forEach((d) => warn.push("ドメインに見える字面 " + d));

  for (const k of ["title", "rationale", "path"]) {
    if (typeof obj[k] !== "string" || !obj[k]) ng.push(k + " が無い");
  }
  const p = String(obj.path || "");
  if (p) {
    let okExt = false;
    for (const e of EDITABLE) if (p.length > e.length && p.slice(-e.length) === e) okExt = true;
    if (!okExt) ng.push("対象外の拡張子: " + p);
    for (const b of BLOCKED_PREFIX) if (p.indexOf(b) === 0) ng.push("触れない場所: " + p);
  }
  let lines = 0;
  if (typeof obj.append === "string" && obj.append) {
    lines = lineCount(obj.append);
  } else if (typeof obj.new_string === "string") {
    lines = lineCount(obj.new_string);
    if (obj.old_string) lines += lineCount(obj.old_string);
  } else {
    ng.push("append も new_string も無い");
  }
  if (lines > MAX_LINES) ng.push("追加+削除が " + lines + "行 (" + MAX_LINES + "行まで)");
  return { ng, warn, title: String(obj.title || ""), lines };
}

module.exports = { lintText, domainish, headingTags, escapeProblems, MAX_LINES };

if (require.main === module) {
  const fs = require("fs");
  const files = process.argv.slice(2);
  let bad = 0;
  for (const f of files) {
    const r = lintText(fs.readFileSync(f, "utf8"));
    const head = (r.ng.length ? "NG  " : "OK  ") + f + "  " + r.title;
    console.log(head);
    r.ng.forEach((m) => console.log("      NG   " + m));
    r.warn.forEach((m) => console.log("      注意 " + m));
    if (r.ng.length) bad += 1;
  }
  console.log("---");
  console.log(files.length + "通 中 " + bad + "通 が NG");
  process.exit(bad ? 1 : 0);
}
