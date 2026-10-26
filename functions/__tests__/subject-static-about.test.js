//
// 科目ごとの静的な説明 (生成した頁の noscript の塊) のガード。
//
// 何を直したか: 科目10本の頁は head の札だけが別物で、描画しないクローラが
// 見る本文は11本とも同一だった (3,826文字。10/26 00:48便 に実測)。殻 (SPA の
// 全画面の文面) が同じで、科目の字が1文字も入っていなかった。/biz-pm-planning
// に「製品企画」も「工場計画と設備管理」も無い状態である。
// _dev/gen-seo.py が、科目定義と料金設定から読んだ字面を noscript の塊にして
// 本文の先頭に入れる。JS が動く利用者には1pxも出ない (06:48便 に Chromium で
// 実測。幅390で 3819、幅360で 4192。塊を入れる前と同じ)。
//
// 正本を2つにしないことが、この仕掛けの要である。文章は科目ごとの subject.js、
// 問題数と無料の境目は config/pricing.js、着地頁の題はその頁の title が正本で、
// 台本は読むだけ。だから此処では「台本に写しが無いこと」を見張る。
//
// 台本は実行しない (公開ディレクトリに追跡外のファイルができる)。字面で見る。
// 正規表現は使わない。indexOf と split で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const NL = String.fromCharCode(10);
const GEN = read("_dev/gen-seo.py");
const REGISTRY = read("subjects/registry.js");
const BASE_CSS = read("css/base.css");

function enabledIds() {
  const out = [];
  const parts = REGISTRY.split('id: "');
  for (let i = 1; i < parts.length; i++) {
    const end = parts[i].indexOf('"');
    if (end < 0) continue;
    const id = parts[i].slice(0, end);
    if (id === "all" || out.indexOf(id) >= 0) continue;
    if (parts[i].indexOf("enabled: true") < 0) continue;
    out.push(id);
  }
  return out;
}

// 台本と同じ読み方で subject.js から1つの字面を取る
function quoted(text, key) {
  const at = text.indexOf(NL + "  " + key + ":");
  if (at < 0) return "";
  const i = text.indexOf('"', at);
  if (i < 0) return "";
  const j = text.indexOf('"', i + 1);
  if (j < 0) return "";
  return text.slice(i + 1, j);
}

function labels(text, key) {
  const at = text.indexOf("  " + key + ": {");
  if (at < 0) return [];
  const end = text.indexOf(NL + "  },", at);
  if (end < 0) return [];
  const out = [];
  text
    .slice(at, end)
    .split(NL)
    .slice(1)
    .forEach((line) => {
      const k = line.lastIndexOf(': "');
      if (k < 0) return;
      const rest = line.slice(k + 3);
      const q = rest.indexOf('"');
      if (q <= 0) return;
      if (out.indexOf(rest.slice(0, q)) < 0) out.push(rest.slice(0, q));
    });
  return out;
}

function subjectJs(id) {
  const rel = "subjects/" + id + "/subject.js";
  return exists(rel) ? read(rel) : "";
}

// 台本の GUIDE_FOR から、着地頁への道を取り出す
function guidePaths() {
  const at = GEN.indexOf("GUIDE_FOR = {");
  if (at < 0) return [];
  const end = GEN.indexOf(NL + "}", at);
  if (end < 0) return [];
  const out = [];
  GEN.slice(at, end)
    .split(NL)
    .forEach((line) => {
      const k = line.lastIndexOf(': "');
      if (k < 0) return;
      const rest = line.slice(k + 3);
      const q = rest.indexOf('"');
      if (q <= 0) return;
      out.push(rest.slice(0, q));
    });
  return out;
}

describe("科目ごとの静的な説明 — 台本が科目定義から組む", () => {
  test("科目が1本以上在る (この表が空なら以下は何も見張れない)", () => {
    expect(enabledIds().length > 0).toBe(true);
  });

  test("台本が塊を組み、本文の先頭に入れている", () => {
    expect(GEN.indexOf("def subject_noscript(") >= 0).toBe(true);
    expect(GEN.indexOf("block = subject_noscript(sid, counts, free_max, free_daily)") >= 0).toBe(true);
    // 先頭に入れる = body の開きタグを探している。末尾に戻すと、
    // 殻の3,826文字より後ろに科目の字が落ちる。
    expect(GEN.indexOf('opening = LT + "body" + GT') >= 0).toBe(true);
    expect(GEN.indexOf("body = body[:cut] + chr(10) + block.rstrip(chr(10)) + body[cut:]") >= 0).toBe(true);
  });

  test("塊は noscript の中で開いて閉じている (JS が動く利用者に出さない)", () => {
    expect(GEN.indexOf('body = "  " + LT + "noscript" + GT + chr(10)') >= 0).toBe(true);
    expect(GEN.indexOf('body += "  " + LT + "/noscript" + GT + chr(10)') >= 0).toBe(true);
  });

  test("文章は科目定義から読む。台本に写しを置かない", () => {
    // 写すと、科目定義を直したときに頁だけ古いまま残る。
    expect(GEN.indexOf('"subjects", sid, "subject.js"') >= 0).toBe(true);
    const copied = [];
    enabledIds().forEach((id) => {
      const text = subjectJs(id);
      if (!text) return;
      ["homeNote", "startExpect"].forEach((key) => {
        const value = quoted(text, key);
        if (value && value.length > 12 && GEN.indexOf(value) >= 0) {
          copied.push(id + "." + key);
        }
      });
    });
    expect(copied.join(",")).toBe("");
  });

  test("問題数と無料の境目は料金設定から読む。金額は持ち込まない", () => {
    // 金額は按分の式が正本なので、台本に数字を写すと正本が2つになる。
    expect(GEN.indexOf('"config", "pricing.js"') >= 0).toBe(true);
    expect(GEN.indexOf("FREE_SUBJECT_MAX_COUNT = ") >= 0).toBe(true);
    expect(GEN.indexOf("PRICE_MIN") < 0).toBe(true);
    expect(GEN.indexOf("PRICE_MAX") < 0).toBe(true);
    expect(GEN.indexOf("PACK_PRICE") < 0).toBe(true);
  });

  test("有効な科目すべてに、塊が空にならない材料が在る", () => {
    // 足りない科目は塊が出ない = その URL だけ本文が殻のままになる。
    // 直し方: その科目の subject.js に homeNote と modules を書く。
    const thin = [];
    enabledIds().forEach((id) => {
      const text = subjectJs(id);
      if (!text) {
        thin.push(id + ":no-subject-js");
        return;
      }
      if (!quoted(text, "homeNote")) thin.push(id + ":homeNote");
      if (labels(text, "modules").length === 0) thin.push(id + ":modules");
    });
    expect(thin.join(",")).toBe("");
  });

  test("着地頁への link は、実在する頁だけ", () => {
    const missing = guidePaths().filter((rel) => !exists(rel.slice(1)));
    expect(missing.join(",")).toBe("");
  });

  test("着地頁の題も写さない (その頁の title が正本)", () => {
    const copied = [];
    guidePaths().forEach((rel) => {
      if (!exists(rel.slice(1))) return;
      const text = read(rel.slice(1));
      const i = text.indexOf("<title>");
      const j = text.indexOf("</title>", i);
      if (i < 0 || j < 0) return;
      const title = text.slice(i + 7, j).trim();
      if (title.length > 12 && GEN.indexOf(title) >= 0) copied.push(rel);
    });
    expect(copied.join(",")).toBe("");
  });

  test("塊の見た目の指定は在るが、画面の CSS には混ぜない", () => {
    // noscript の中にしか出ない class なので、JS が動く利用者には効かない。
    expect(BASE_CSS.indexOf(".static-subject-about {") >= 0).toBe(true);
    expect(GEN.indexOf("static-subject-about") >= 0).toBe(true);
  });
});
