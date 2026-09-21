/**
 * ビジネスキャリア検定 — オペレーション専門（ビジネス道場）
 * 問題データは学習道場 subjects/biz-pm-operation/ がマスタ。
 */
var SUBJECT = {
  id: "biz-pm-operation",
  title: "生産管理オペレーション専門",
  formalTitle: "ビジネスキャリア検定（生産管理オペレーション2級・専門知識）",
  shortTitle: "オペレーション専門",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_biz_pm_operation_stats_v1",
  homeNote:
    "作業管理・標準時間・統制・指導・作業環境を章ごとにクイズで学べます。",
  startExpect:
    "共通知識・プランニング専門と重ならない論点を中心に、現場の取り違え防止を重視した問題です。",
  categories: {
    term: "用語",
    scenario: "シナリオ",
    judgment: "正誤問題",
    order: "並べ替え",
    contrast: "対比",
    abbr: "略称・正式名称",
  },
  modules: {
    作業管理: "作業管理",
    作業設計: "作業設計",
    作業標準: "作業標準",
    標準時間: "標準時間",
    作業統制: "作業統制",
    作業指導: "作業指導",
    作業環境: "作業環境",
  },
  inputCategories: [],
  moduleFilterable: ["term", "scenario", "judgment", "order", "contrast", "abbr"],
};
