/**
 * オントロジー基礎 — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/ai-ontology-core/ がマスタ。
 */
var SUBJECT = {
  id: "ai-ontology-core",
  title: "オントロジー基礎",
  formalTitle: "AI知識表現・オントロジー基礎（実務判断）",
  shortTitle: "オントロジー基礎",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_ai_ontology_core_stats_v1",
  homeNote:
    "用語が不安なら先に「オントロジー入門」で型の地図を作ってください。入門の次は、おすすめの学び順（属性から判断へ→用語の地図→定義→クラス・個体…）で進めます。暗記ではなく、設計の取り違えとトレードオフが中心です。動向ニュースや製品の最新機能は扱いません。",
  /** 開始CTA直上の期待値（1文のみ。出題ロジックは変えない） */
  startExpect:
    "入門の次は設計の取り違え。おすすめの学び順で進めます。",
  categories: {
    scenario: "シナリオ",
    judgment: "正誤問題",
  },
  defaultCategories: ["scenario", "judgment"],
  modules: {
    "属性から判断へ": "属性から判断へ",
    "用語の地図": "用語の地図",
    "オントロジーの定義": "オントロジーの定義",
    "クラス・個体": "クラス・個体",
    "関係の種類": "関係の種類",
    制約: "制約",
    "推論の期待値": "推論の期待値",
    "タクソノミ対比": "タクソノミ対比",
    ナレッジグラフ: "ナレッジグラフ",
    "LLM時代の役割": "LLM時代の役割",
    "運用・版管理": "運用・版管理",
  },
  inputCategories: [],
  moduleFilterable: ["scenario", "judgment"],
};
