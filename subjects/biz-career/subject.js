/**
 * ビジネスキャリア検定 — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/biz-career/ がマスタ。
 */
var SUBJECT = {
  id: "biz-career",
  title: "ビジネスキャリア検定",
  shortTitle: "ビジネスキャリア",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_biz_career_stats_v1",
  homeNote:
    "生産管理プランニング2級・生産管理ロジティクス2級の共通知識を扱います。モジュールは章ごと（品質・原価・納期・安全衛生・環境）に分かれます。",
  categories: {
    term: "用語",
    scenario: "シナリオ",
    judgment: "正誤問題",
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
  moduleFilterable: ["term", "scenario", "judgment", "abbr"],
};
