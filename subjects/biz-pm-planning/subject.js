/**
 * ビジネスキャリア検定 — プランニング専門（ビジネス道場）
 * 問題データは学習道場 subjects/biz-pm-planning/ がマスタ。
 */
var SUBJECT = {
  id: "biz-pm-planning",
  title: "生産管理プランニング専門",
  formalTitle: "ビジネスキャリア検定（生産管理プランニング専門知識）",
  shortTitle: "プランニング専門",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_biz_pm_planning_stats_v1",
  homeNote:
    "製品企画からプロセス型生産管理まで、章ごとにクイズで学べます。共通知識「生産管理」とあわせる想定です。",
  startExpect:
    "用語暗記より、現場での価格・原価・日程の取り違え防止を重視した問題です。",
  categories: {
    term: "用語",
    scenario: "シナリオ",
    judgment: "正誤問題",
    order: "並べ替え",
    contrast: "対比",
    abbr: "略称・正式名称",
  },
  modules: {
    製品企画: "製品企画",
    設計管理: "設計管理",
    設計工程管理: "設計工程管理",
    生産システム: "生産システム",
    "工程管理（加工型・組立型）": "工程管理（加工型・組立型）",
    "生産管理（プロセス型）": "生産管理（プロセス型）",
    工場計画と設備管理: "工場計画と設備管理",
  },
  inputCategories: [],
  moduleFilterable: ["term", "scenario", "judgment", "order", "contrast", "abbr"],
};
