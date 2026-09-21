/**
 * オントロジー入門 — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/ai-ontology-intro/ がマスタ。
 * 公開は registry enabled:true（フクロウ合格後）。表示名「オントロジー入門」確定。
 *
 * 【教科書モード】正本: docs/ONTOLOGY_INTRO_TEXTBOOK.md
 * chapters は modules キーと 1:1。問題側に chapter は付けない（Phase1）。
 * 進捗ストレージは storageKey と分離:
 *   chapterProgressKey: "biz_dojo_ai_ontology_intro_chapters_v1"
 *   // { currentChapterId, cleared: { intro: true, why: true, ... }, correctIdsByChapter: { intro: ["aoi-sc-intro-001", ...] } }
 */
var SUBJECT = {
  id: "ai-ontology-intro",
  title: "オントロジー入門",
  shortTitle: "オントロジー入門",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_ai_ontology_intro_stats_v1",
  chapterProgressKey: "biz_dojo_ai_ontology_intro_chapters_v1",
  lessonProgressKey: "biz_dojo_ai_ontology_intro_lesson_v1",
  homeNote:
    "オントロジーとは何か、なぜAIの現場で話題になるのかから入り、知識の表し方の基本を具体例で学びます。動向や製品名は扱いません。操作の無料科目（Outlook／Teamsなど）とは別物です。",
  /** 開始CTA直上の期待値（1文のみ。出題ロジックは変えない） */
  startExpect:
    "第1章は読み物から入ります。途中の確認クイズで取り違えを減らしてから次へ進みます。",
  categories: {
    scenario: "シナリオ",
    judgment: "正誤問題",
  },
  defaultCategories: ["scenario", "judgment"],
  modules: {
    "オントロジーとは": "オントロジーとは",
    "なぜ型で置くか": "なぜ型で置くか",
    "クラスとインスタンス": "クラスとインスタンス",
    属性: "属性",
    関係: "関係",
    制約: "制約",
  },
  /** 章順教科書。module キーと 1:1。クリア＝章プール内ユニーク正解数 >= clearCorrect */
  chapters: [
    { id: "intro", order: 1, module: "オントロジーとは", clearCorrect: 6 },
    { id: "why", order: 2, module: "なぜ型で置くか", clearCorrect: 8 },
    { id: "cls", order: 3, module: "クラスとインスタンス", clearCorrect: 8 },
    { id: "atr", order: 4, module: "属性", clearCorrect: 6 },
    { id: "rel", order: 5, module: "関係", clearCorrect: 6 },
    { id: "cns", order: 6, module: "制約", clearCorrect: 5 },
  ],
  /** "textbook" | "free" — 入門の既定は章順教科書 */
  defaultStudyMode: "textbook",
  inputCategories: [],
  moduleFilterable: ["scenario", "judgment"],
};
