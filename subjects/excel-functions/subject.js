/**
 * Excel関数・表計算実務 — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/excel-functions/ がマスタ。
 */
var SUBJECT = {
  id: "excel-functions",
  title: "Excel関数・表計算実務",
  shortTitle: "Excel関数",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_excel_functions_stats_v1",
  homeNote:
    "集計・検索参照・論理・日付・文字列・ピボット／表操作。実務で取り違えやすい隣接関数をシナリオと正誤で固めます。Excel 365前提の関数を含む。解説で版注記を明示します。",
  categories: {
    scenario: "シナリオ",
    judgment: "正誤問題",
    abbr: "略称・正式名称",
  },
  /** 初期ONにする出題カテゴリ（未指定時は全カテゴリON）。略称は公開初日はデフォルト外 */
  defaultCategories: ["scenario", "judgment"],
  modules: {
    基本集計: "基本集計",
    検索参照: "検索参照",
    論理: "論理",
    日付時刻: "日付時刻",
    文字列: "文字列",
    "ピボット・表操作": "ピボット・表操作",
  },
  /** 記述式（コード入力）を使うカテゴリ。空なら記述式UIを出さない */
  inputCategories: [],
  moduleFilterable: ["scenario", "judgment", "abbr"],
};
