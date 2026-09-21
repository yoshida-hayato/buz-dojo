/**
 * ビジネスキャリア検定 — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/biz-career/ がマスタ。
 */
var SUBJECT = {
  id: "biz-career",
  title: "生産管理",
  /** 正式名・検定名（副題・課金表示用。第一印象は title / shortTitle） */
  formalTitle: "ビジネスキャリア検定（生産管理）",
  shortTitle: "生産管理",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_biz_career_stats_v1",
  homeNote:
    "生産管理の共通知識を扱います。ビジネスキャリア検定（プランニング2級・オペレーション2級）の範囲が中心です。現場のQCD・4Mなど、似た用語の取り違えをシナリオ・正誤・並べ替え・対比で減らします。",
  /** 開始CTA直上の期待値（1文のみ。出題ロジックは変えない） */
  startExpect:
    "用語の暗記より、現場での取り違え防止を重視した問題です。",
  categories: {
    term: "用語",
    scenario: "シナリオ",
    judgment: "正誤問題",
    order: "並べ替え",
    contrast: "対比",
    abbr: "略称・正式名称",
  },
  modules: {
    品質管理: "品質管理",
    原価管理: "原価管理",
    納期管理: "納期管理",
    安全衛生管理: "安全衛生管理",
    環境管理: "環境管理",
  },
  /** 記述式（コード入力）を使うカテゴリ。空なら記述式UIを出さない */
  inputCategories: [],
  moduleFilterable: ["term", "scenario", "judgment", "order", "contrast", "abbr"],
};
