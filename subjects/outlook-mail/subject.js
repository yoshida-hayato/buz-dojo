/**
 * Outlookメール実務 — 科目定義（ビジネス道場）
 * 問題データは学習道場 subjects/outlook-mail/ がマスタ。
 */
var SUBJECT = {
  id: "outlook-mail",
  title: "Outlookメール実務",
  shortTitle: "Outlook",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_outlook_mail_stats_v1",
  homeNote:
    "送受信・宛先／返信・予定表・整理検索の実務判断を扱います。誤送信・全員返信・To/CC/BCC・予定の公開範囲など、日常で起きやすい事故をシナリオと正誤で減らします。",
  categories: {
    scenario: "シナリオ",
    judgment: "正誤問題",
    abbr: "略称・正式名称",
  },
  /** 初期ONにする出題カテゴリ（未指定時は全カテゴリON）。略称は公開初日はデフォルト外 */
  defaultCategories: ["scenario", "judgment"],
  modules: {
    送受信: "送受信",
    "宛先・返信": "宛先・返信",
    "予定表・会議招集": "予定表・会議招集",
    "整理・検索・ルール": "整理・検索・ルール",
  },
  /** 記述式（コード入力）を使うカテゴリ。空なら記述式UIを出さない */
  inputCategories: [],
  moduleFilterable: ["scenario", "judgment", "abbr"],
};
