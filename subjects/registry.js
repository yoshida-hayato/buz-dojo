/**
 * ビジネス道場 — 科目レジストリ
 *
 * 問題データ（questions / judgment / changelog 等）はここには置かない。
 * contentBase でマスタ（SAP道場 / 学習道場）の公開 URL を指す。
 * このリポジトリの subjects/<id>/ には branding・段位用の subject.js のみ置く。
 */
const SUBJECT_REGISTRY = [
  {
    id: "sap",
    title: "SAP",
    shortTitle: "SAP",
    description: "Tコード・用語・シナリオ・正誤・ABAP構文など、SAP業務の実践クイズ",
    path: "subjects/sap",
    contentBase: "https://sap-dojo.web.app/data",
    contentVersionUrl: "https://sap-dojo.web.app/data/version.js",
    contentMaster: "SAP道場（sap-dojo）",
    enabled: true,
    accent: "#0b5fff",
  },
  {
    id: "windows-shortcuts",
    title: "Windowsショートカット",
    shortTitle: "ショートカット",
    description: "Windows・Excel・PowerPoint・Word・ブラウザ・Teamsのキー操作",
    path: "subjects/windows-shortcuts",
    contentBase: "https://gakusyu-dojo.web.app/subjects/windows-shortcuts",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#1d4ed8",
  },
  {
    id: "biz-career",
    title: "ビジネスキャリア検定（生産管理）",
    shortTitle: "生管キャリア",
    description: "生産管理プランニング2級・ロジティクス2級の共通知識",
    path: "subjects/biz-career",
    contentBase: "https://gakusyu-dojo.web.app/subjects/biz-career",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#0f766e",
  },
];

/** プレミアムパック（価格は config/pricing.js の PricingConfig を優先） */
const PACK_PLAN = {
  id: "all",
  get title() {
    return typeof PricingConfig !== "undefined" && PricingConfig.PACK_TITLE
      ? PricingConfig.PACK_TITLE
      : "プレミアムパック";
  },
  description:
    "すべての問題集が無制限。機能要望の優先対応と、問題追加のたたき台（テキスト）提出ができます。科目の新規追加は内容を見て検討します。",
  benefits: [
    "公開中のすべての問題集を無制限で学習",
    "追加機能の要望を優先的に受付",
    "「こんな問題を追加してほしい」をテキストで提出（箇条書きやメモでも可）",
    "科目の新規追加は要検討（ご要望は受け付けます）",
  ],
  get priceYen() {
    return typeof PricingConfig !== "undefined" && PricingConfig.PACK_PRICE_YEN
      ? PricingConfig.PACK_PRICE_YEN
      : 1980;
  },
};
