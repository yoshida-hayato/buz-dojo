// 基本情報技術者試験 科目A — 科目定義 (ビジネス道場)
//
// 問題データはこの repo に在る (data/fe-kamoku-a/questions.js)。
// 中身は情報処理推進機構が公表した「科目A サンプル問題 (60問) セット」の
// うち、文字だけで成立する46問である。転載の許諾は台帳
// (config/exam-licenses.js の ipa-joho-shori) が granted で、条件は
// 出典の明記と改変の明記。問題ごとに source を持たせてある。
//
// 出どころが public-past-exam なので、問題数に関わらず無料になる
// (2026-10-26 の社長指示「公開情報で金は取らない」)。
var SUBJECT = {
  id: "fe-kamoku-a",
  title: "基本情報 科目A",
  shortTitle: "科目A",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_fe_kamoku_a_stats_v1",
  homeNote:
    "基本情報技術者試験の科目Aを、情報処理推進機構が公表した公開問題そのもので演習します。出題は8分野で、1問ごとに出典を表示します。解説は当道場が書いたものです。図や表を見ないと解けない問は収めていません。",
  startExpect:
    "本番と同じ四肢択一です。選択肢の並びは出題のたびに入れ替わるので、記号ではなく中身で選んでください。",
  categories: {
    scenario: "択一",
  },
  defaultCategories: ["scenario"],
  modules: {
    基礎理論とアルゴリズム: "基礎理論とアルゴリズム",
    開発技術: "開発技術",
    コンピュータ構成とOS: "コンピュータ構成とOS",
    データベース: "データベース",
    ネットワーク: "ネットワーク",
    セキュリティ: "セキュリティ",
    マネジメント: "マネジメント",
    ストラテジ: "ストラテジ",
  },
  defaultStudyMode: "free",
  inputCategories: [],
  moduleFilterable: ["scenario"],
};
