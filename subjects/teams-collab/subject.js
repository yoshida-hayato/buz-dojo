/**
 * Teamsの使い方 — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/teams-collab/ がマスタ。
 */
var SUBJECT = {
  id: "teams-collab",
  title: "Teamsの使い方",
  shortTitle: "Teams",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_teams_collab_stats_v1",
  homeNote:
    "会議参加・画面共有／ミュート・チャット／メンション・チャネル／チーム・ファイル置き場の判断を扱います。誤操作・誤共有・誤メンションなど、日常で起きやすい事故をシナリオと正誤で減らします。キー操作そのものはショートカット科目へ。",
  categories: {
    scenario: "シナリオ",
    judgment: "正誤問題",
    abbr: "略称・正式名称",
  },
  /** 初期ONにする出題カテゴリ（未指定時は全カテゴリON）。略称は公開初日はデフォルト外 */
  defaultCategories: ["scenario", "judgment"],
  modules: {
    "会議・参加": "会議・参加",
    "画面共有・ミュート": "画面共有・ミュート",
    "チャット・メンション": "チャット・メンション",
    "チャネル・チーム": "チャネル・チーム",
    "ファイル共有の置き場": "ファイル共有の置き場",
  },
  /** 記述式（コード入力）を使うカテゴリ。空なら記述式UIを出さない */
  inputCategories: [],
  moduleFilterable: ["scenario", "judgment", "abbr"],
};
