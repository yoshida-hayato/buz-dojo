/**
 * Windows / Office ショートカット — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/windows-shortcuts/ がマスタ。
 */
var SUBJECT = {
  id: "windows-shortcuts",
  title: "Windowsショートカット",
  shortTitle: "ショートカット",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_windows_shortcuts_stats_v1",
  homeNote:
    "Windows・Excel・PowerPoint・Word・ブラウザ・Teamsのキー操作です。機能を見てキーを1つずつ選びます。ヘッダーの「ショートカット一覧」から検索もできます。",
  categories: {
    shortcut: "ショートカット",
  },
  modules: {
    Windows: "Windows",
    Excel: "Excel",
    PowerPoint: "PowerPoint",
    Word: "Word",
    ブラウザ: "ブラウザ",
    Teams: "Teams",
  },
  inputCategories: [],
  moduleFilterable: ["shortcut"],
};
