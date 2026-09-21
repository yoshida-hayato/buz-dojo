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
    /** depth = じっくり学ぶ（応用・判断） / ops = すぐ使える（操作・無料入口含む） */
    depthTier: "depth",
    cardEyebrow: "応用・判断",
  },
  {
    id: "windows-shortcuts",
    title: "Windowsショートカット",
    shortTitle: "ショートカット",
    description:
      "Windows・Excel・PowerPoint・Word・ブラウザ・Teamsのキー操作。会議の進め方は「Teams」へ",
    path: "subjects/windows-shortcuts",
    contentBase: "https://gakusyu-dojo.web.app/subjects/windows-shortcuts",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#1d4ed8",
    depthTier: "ops",
    cardEyebrow: "操作",
  },
  {
    id: "biz-career",
    title: "生産管理",
    formalTitle: "ビジネスキャリア検定（生産管理）",
    shortTitle: "生産管理",
    description:
      "生産管理の共通知識。ビジネスキャリア検定（プランニング2級・オペレーション2級）の範囲が中心です",
    path: "subjects/biz-career",
    contentBase: "https://gakusyu-dojo.web.app/subjects/biz-career",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#0f766e",
    depthTier: "depth",
    cardEyebrow: "応用・判断",
  },
  {
    id: "biz-pm-planning",
    title: "生産管理プランニング専門",
    formalTitle: "ビジネスキャリア検定（生産管理プランニング専門知識）",
    shortTitle: "プランニング専門",
    description:
      "プランニング2級の専門範囲。製品企画からプロセス型生産管理まで章ごとのクイズ。共通知識「生産管理」の次に学ぶ想定です",
    path: "subjects/biz-pm-planning",
    contentBase: "https://gakusyu-dojo.web.app/subjects/biz-pm-planning",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#0d9488",
    depthTier: "depth",
    cardEyebrow: "専門知識",
  },
  {
    id: "biz-pm-operation",
    title: "生産管理オペレーション専門",
    formalTitle: "ビジネスキャリア検定（生産管理オペレーション2級・専門知識）",
    shortTitle: "オペレーション専門",
    description:
      "オペレーション2級の専門範囲。作業管理・標準時間・統制・指導・作業環境。共通知識・プランニングと重ならない論点中心",
    path: "subjects/biz-pm-operation",
    contentBase: "https://gakusyu-dojo.web.app/subjects/biz-pm-operation",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#0891b2",
    depthTier: "depth",
    cardEyebrow: "専門知識",
  },
  {
    id: "excel-functions",
    title: "Excel関数・表計算実務",
    shortTitle: "Excel関数",
    description: "関数・表計算の実務判断（集計・検索参照・論理・日付など）",
    path: "subjects/excel-functions",
    contentBase: "https://gakusyu-dojo.web.app/subjects/excel-functions",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#047857",
    depthTier: "depth",
    cardEyebrow: "応用・判断",
  },
  {
    id: "outlook-mail",
    title: "Outlookメール実務",
    shortTitle: "Outlook",
    description:
      "送受信・宛先／返信・予定表の実務判断。誤送信・全員返信・To/CC/BCC・予定の公開範囲の事故防止にも",
    path: "subjects/outlook-mail",
    contentBase: "https://gakusyu-dojo.web.app/subjects/outlook-mail",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#0369a1",
    depthTier: "ops",
    cardEyebrow: "操作",
  },
  {
    id: "teams-collab",
    title: "Teamsの使い方",
    shortTitle: "Teams",
    description:
      "ミュート・画面共有・チャネルとチャットの使い分けなど、会議まわりの判断と事故防止。キー操作は「ショートカット」へ",
    path: "subjects/teams-collab",
    contentBase: "https://gakusyu-dojo.web.app/subjects/teams-collab",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#464775",
    depthTier: "ops",
    /** 操作帯内の見分け（帯見出しより下でも eyebrow で切り分け） */
    homeFeatured: true,
    cardEyebrow: "会議・チャット",
  },
  /**
   * オントロジー入門 — 無料帯（公開中）。基礎の直前。導線: docs/ONTOLOGY_INTRO_UX.md
   * homeFeatured は入門＋基礎の両方 true（同帯はレジストリ順で入門→基礎）。
   */
  {
    id: "ai-ontology-intro",
    title: "オントロジー入門",
    shortTitle: "オントロジー入門",
    description:
      "まず「オントロジーとは」から。型・属性・関係へ進む入り口です。操作の無料科目とは別物です",
    path: "subjects/ai-ontology-intro",
    contentBase: "https://gakusyu-dojo.web.app/subjects/ai-ontology-intro",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#6366f1",
    depthTier: "depth",
    homeFeatured: true,
    cardEyebrow: "はじめて",
  },
  {
    id: "ai-ontology-core",
    title: "オントロジー基礎",
    formalTitle: "AI知識表現・オントロジー基礎（実務判断）",
    shortTitle: "オントロジー基礎",
    description:
      "入門の次は設計の取り違え。「属性から判断へ」からおすすめの学び順で進めます。用語が不安なら「オントロジー入門」から。操作の無料科目とは別です",
    path: "subjects/ai-ontology-core",
    contentBase: "https://gakusyu-dojo.web.app/subjects/ai-ontology-core",
    contentVersionUrl: "https://gakusyu-dojo.web.app/data/version.js",
    contentMaster: "学習道場（gakusyu-dojo）",
    enabled: true,
    accent: "#4f46e5",
    depthTier: "depth",
    homeFeatured: true,
    cardEyebrow: "設計の判断",
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
    "公開中のすべての科目を制限なく学習できます。同額のまま科目の追加・改訂を受けられ、要望は今後の改訂の参考にします。",
  benefits: [
    "公開中のすべての科目を制限なく学習できる",
    "同額のまま科目の追加・改訂を受けられる（更新は更新履歴で確認）",
    "問題追加の要望を受付（箇条書き可）。機能要望は優先確認",
  ],
  get priceYen() {
    return typeof PricingConfig !== "undefined" && PricingConfig.PACK_PRICE_YEN
      ? PricingConfig.PACK_PRICE_YEN
      : 1980;
  },
};
