/**
 * 科目テンプレート — コピーして subjects/<id>/ にリネームし、registry.js に追加する。
 * 問題データは置かない。registry の contentBase でマスタ URL を指定する。
 */
var SUBJECT = {
  id: "subject-id",
  title: "科目名",
  shortTitle: "略称",
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  storageKey: "biz_dojo_subject_id_stats_v1",
  homeNote: "科目の説明。",
  categories: {
    term: "用語",
  },
  modules: {},
  inputCategories: [],
  moduleFilterable: ["term"],
  /** マスタ側に置く追加スクリプト（contentBase からの相対パス） */
  extraScripts: [],
};
