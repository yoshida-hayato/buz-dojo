//
// トップページ (未ログインの初見で最初に出る科目ピッカー) の説明2つは、
// 初期状態で畳まれていること。
//
// 2026-10-18 18:48便の実測 (ローカルで描画して計測):
//   畳む前  390x844 で最初の科目カードは y=507、下端 752。360x640 では
//           下端 820 で、画面 640 の外。つまり幅 360 の端末では、科目カードを
//           1枚も最後まで見ないまま最初の画面が終わっていた
//   畳んだ後 どちらの幅でも y=253、下端 498 と 544。1枚まるごと入る。
//           全頁の高さは 4360 から 4106、4747 から 4472 に縮んだ
//
// 社長の判断 (2026-10-18 13:48便): 携帯の説明2つは折りたたみ式にしてよい。
// ただし文面は消さない。だから畳む入れ物を足すだけで、中の2つの段落は
// 1文字も変えていない。
//
// なぜ index.html ではなく JS で組み立てているか。
// このリポジトリへのパッチは Slack を通る。Slack は送信時に HTML を
// Markdown に変換するので、見出しのタグは記号になり、開閉のタグは
// 消えてなくなる (2026-10-18 18:48便 に実測。1件が破棄された)。
// だから、この入れ物は document.createElement で作る。
// 同じ理由で、このファイルにも生のタグを書かない。
//
// もう1つ見張るものがある。この画面の CSS である。
// index.html は最初に base.css と header.css と subjects.css の3枚しか
// 読み込まない。残りは画面に入ったときに後から足される。だから
// この畳みの見た目を quiz.css や style.css に書くと、初見の訪問者には
// 素の入れ物が出て、あとで利用者が出題画面に入った瞬間に、
// 戻ってきた科目ピッカーの見た目だけが変わる。
//
// 正規表現は使わない (パッチ経路に量指定子を通せない)。すべて indexOf で読む。
//
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const js = read("js/screens-subjects.js");
const subjectsCss = read("css/subjects.css");
const html = read("index.html");

describe("トップページの説明2つは畳まれている", () => {
  test("畳む入れ物を JS が組み立てている", () => {
    expect(js.indexOf("function foldSubjectsIntro()")).toBeGreaterThan(-1);
    expect(js.indexOf('createElement("details")')).toBeGreaterThan(-1);
    expect(js.indexOf('createElement("summary")')).toBeGreaterThan(-1);
    expect(js.indexOf('box.id = "subjects-intro"')).toBeGreaterThan(-1);
  });

  test("科目ピッカーを描くたびに呼ばれている", () => {
    const at = js.indexOf("function updateSubjectPickerNotices(");
    expect(at).toBeGreaterThan(-1);
    const body = js.slice(at, at + 400);
    expect(body.indexOf("foldSubjectsIntro();")).toBeGreaterThan(-1);
  });

  test("畳む相手の2つが index.html に在る", () => {
    expect(html.indexOf('id="subjects-pick-hint"')).toBeGreaterThan(-1);
    expect(html.indexOf("site-notice site-notice-quality")).toBeGreaterThan(-1);
  });

  test("見た目は最初に読む CSS (subjects.css) に在る", () => {
    expect(subjectsCss.indexOf(".subjects-intro")).toBeGreaterThan(-1);
    expect(subjectsCss.indexOf(".subjects-intro summary")).toBeGreaterThan(-1);
    // 組み立てる前は隠しておく (開いた状態が一瞬見えないように)
    expect(subjectsCss.indexOf("#subjects-pick-hint { display: none; }")).toBeGreaterThan(-1);
    expect(html.indexOf('href="css/subjects.css"')).toBeGreaterThan(-1);
  });
});
