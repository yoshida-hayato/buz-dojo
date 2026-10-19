/**
 * 科目カードの札 (eyebrow) を戻させないための1枚。
 *
 * なぜ消したか (2026-10-19 06:48便 の観測):
 *   札は10科目すべてに入っていた。応用・判断が3枚、専門知識が2枚、操作が2枚、
 *   会議・チャット、はじめて、設計の判断。前の4つは社長が 2026-10-18 に
 *   「わからない」と言った分類の語づかいそのもので、残りの2つは題と説明文が
 *   すでに言っていた。つまり札はカードの一番目に付く場所を使って、
 *   新しい事実を1つも足していなかった。10枚ぶんの文字を書き出して数えた結果である。
 *   カードの状態 (全問無料 / 本日あと20問 / 購入済み) は丸い札
 *   subject-card-access が全科目ぶん持っているので、消しても何も失わない。
 *   実測: 390px でカード1枚 204px から 175px、全頁 4068px から 3772px。
 *
 * なぜレジストリではなく描画側を見張るか:
 *   subjects/registry.js はブリッジが自動パッチできない場所なので
 *   (subjects/ 配下は subject.js だけ)、cardEyebrow のデータ自体は残っている。
 *   残っていても、描画側が読まなければ画面には出ない。だから見張るのは描画側。
 */
const fs = require("fs");
const path = require("path");

const SCREENS = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "screens-subjects.js"),
  "utf8"
);
const SUBJECTS_CSS = fs.readFileSync(
  path.join(__dirname, "..", "..", "css", "subjects.css"),
  "utf8"
);

describe("科目カードの札は出さない", () => {
  test("描画側が札の入れ物を1つも組み立てない", () => {
    expect(SCREENS.indexOf('class="subject-card-eyebrow')).toBe(-1);
  });

  test("描画側がレジストリの cardEyebrow を読まない", () => {
    expect(SCREENS.indexOf("cardEyebrow")).toBe(-1);
  });

  test("死んだ代入が残っていない", () => {
    expect(SCREENS.indexOf("eyebrowLegacy")).toBe(-1);
    expect(SCREENS.indexOf("showRegistryEyebrow")).toBe(-1);
    expect(SCREENS.indexOf("rawEyebrow")).toBe(-1);
  });

  test("札の CSS も最初に読む1枚から落ちている", () => {
    // subjects.css は index.html が最初に読む3枚のうちの1枚。
    // 出ない見た目を置いたままにすると、初見の訪問者に無駄な分だけ重くなる
    expect(SUBJECTS_CSS.indexOf(".subject-card-eyebrow")).toBe(-1);
  });

  test("パックの おすすめ の札は残っている (消したのは科目カードだけ)", () => {
    expect(SCREENS.indexOf('class="pack-card-eyebrow"')).toBeGreaterThan(-1);
    expect(SUBJECTS_CSS.indexOf(".pack-card-eyebrow")).toBeGreaterThan(-1);
  });

  test("カードの状態は丸い札が持っている", () => {
    expect(SCREENS.indexOf('class="subject-card-access"')).toBeGreaterThan(-1);
  });
});
