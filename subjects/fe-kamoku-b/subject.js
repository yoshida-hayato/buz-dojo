// 基本情報技術者試験 科目B — 科目定義 (ビジネス道場)
//
// この科目だけは問題データもこの repo に在る (data/fe-kamoku-b/questions.js)。
// 社長が 2026-11-01 11:31 に、公開情報の科目にかぎり問題データを
// こちら側に置くことを許したため。宣言はレジストリの2枚目
// (config/extra-subjects.js) に在る。
//
// 問題は全部こちらの自作である。IPA が公表した過去問の転載は1問も無い
// (公表されている科目B の問題は1年度6問・4年度ぶんで24問しか無く、
// 転載では科目として成り立たない。実測は docs/EXAM_LICENSE_REGISTRY.md)。
// だから出どころは original で、問題数が100以下のあいだは無料になる。
var SUBJECT = {
  id: "fe-kamoku-b",
  title: "基本情報 科目B",
  shortTitle: "科目B",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_fe_kamoku_b_stats_v1",
  homeNote:
    "基本情報技術者試験の科目Bを、擬似言語のトレースと情報セキュリティの2本立てで演習します。問題は当道場の自作で、試験の擬似言語の書き方 (代入の矢印、for の増分、1から始まる配列の添字) にそろえてあります。手を動かして値を追う練習が中心です。",
  startExpect:
    "最初の数問は代入と分岐だけです。コードを目で追って、変数の値が何になるかを1つずつ確かめてください。",
  // 正誤問題はまだ1問も無いので、選べる分類に出さない。
  // 空の分類を既定に入れると、その分類だけを選んだ人の出題プールが空になる。
  categories: {
    scenario: "シナリオ",
  },
  defaultCategories: ["scenario"],
  modules: {
    擬似言語の基本: "擬似言語の基本",
    繰返しとトレース: "繰返しとトレース",
    配列と探索: "配列と探索",
    関数と再帰: "関数と再帰",
    データ構造: "データ構造",
    情報セキュリティ: "情報セキュリティ",
  },
  defaultStudyMode: "free",
  inputCategories: [],
  moduleFilterable: ["scenario"],
};
