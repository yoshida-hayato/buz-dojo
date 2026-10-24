// 計測イベントの一覧 (docs/FUNNEL_EVENTS.md) が、コードと一致していることの
// 見張り。売上0件・流入未計測のこの事業で、打つ手を決める材料はこの9件しか
// 無い。名前を足したり替えたりしたときに、探す場所の書き物だけが古くなると、
// 次の人は GA4 の画面で在りもしない名前を探すことになる。
const fs = require("fs");
const path = require("path");

const JS_DIR = path.join(__dirname, "..", "..", "js");
const DOC = fs.readFileSync(
  path.join(__dirname, "..", "..", "docs", "FUNNEL_EVENTS.md"),
  "utf8"
);

function eventNamesInCode() {
  const names = new Set();
  const re = /(?:logFunnel|logFunnelWhenReady|logEvent)\(\s*["']([a-z_]+)["']/g;
  for (const file of fs.readdirSync(JS_DIR)) {
    if (!file.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(JS_DIR, file), "utf8");
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
  }
  return Array.from(names).sort();
}

// 一覧の箇条書き (- 名前 (js/ファイル)) だけを拾う。本文のどこかに字面が
// 在るだけでは通さない。接頭辞だけ一致する別名を見逃すため。
function namesInDoc() {
  return (DOC.match(/^- ([a-z_]+) \(js\//gm) || []).map((line) =>
    line.replace(/^- /, "").replace(/ \(js\/$/, "")
  );
}

test("コードが送るイベント名は、すべて一覧の1件として書かれている", () => {
  const listed = namesInDoc();
  const missing = eventNamesInCode().filter((n) => listed.indexOf(n) < 0);
  expect(missing).toEqual([]);
});

test("一覧が挙げる名前は、すべてコードに在る (消した名前が残っていない)", () => {
  const inCode = eventNamesInCode();
  const listed = namesInDoc();
  expect(listed.length).toBeGreaterThan(0);
  const stale = listed.filter((n) => inCode.indexOf(n) < 0);
  expect(stale).toEqual([]);
});

test("決済の最後の2段が一覧に在る (付与されたかを読む側)", () => {
  expect(DOC).toContain("checkout_grant_confirmed");
  expect(DOC).toContain("checkout_grant_timeout");
});

test("付与の確認は、戻りの合図とは別の名前である", () => {
  const code = eventNamesInCode();
  expect(code).toContain("checkout_success_return");
  expect(code).toContain("checkout_grant_confirmed");
});
