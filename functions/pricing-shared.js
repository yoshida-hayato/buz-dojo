/** AUTO-GENERATED from config/pricing.js — edit the source, then run:
 *  python3 _dev/sync-shared.py
 */
/**
 * 料金の単一ソース（クライアント・Cloud Functions 共通）
 *
 * - ブラウザ: <script src="config/pricing.js"> → PricingConfig
 * - Functions: require("./pricing-shared.js") ※ _dev/sync-shared.py で同期
 *
 * 単品料金:
 * - 問題数 ≤ 100 → 無料（¥0）
 * - 101〜2999 → ¥290〜¥980 を問題数に応じて按分（10円単位）
 * - 問題数 ≥ 3000 → 上限 ¥980
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PricingConfig = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PACK_PRICE_YEN = 1980;
  const PRICE_MIN = 290;
  const PRICE_MAX = 980;
  /** この問題数以下は単品無料 */
  const FREE_SUBJECT_MAX_COUNT = 100;
  /** この問題数以上は単品上限（PRICE_MAX） */
  const PRICE_CAP_COUNT = 3000;
  const FREE_DAILY = 20;

  const PACK_TITLE = "プレミアムパック";
  const PACK_PRODUCT_NAME = "ビジネス道場 — プレミアムパック";

  /** Stripe 用の科目カタログ（問題数はサーバ側の料金算出に使用） */
  const SUBJECT_CATALOG = {
    sap: {
      title: "SAP",
      questionCount: 4951,
    },
    "windows-shortcuts": {
      title: "Windowsショートカット",
      questionCount: 341,
    },
    "biz-career": {
      title: "ビジネスキャリア検定（生産管理）",
      questionCount: 823,
    },
    "biz-pm-planning": {
      title: "ビジネスキャリア検定（生産管理プランニング専門知識）",
      questionCount: 694,
    },
    "biz-pm-operation": {
      title: "ビジネスキャリア検定（生産管理オペレーション2級・専門知識）",
      questionCount: 60,
    },
    "excel-functions": {
      title: "Excel関数・表計算実務",
      questionCount: 150,
    },
    "outlook-mail": {
      title: "Outlookメール実務",
      questionCount: 100,
    },
    "teams-collab": {
      title: "Teamsの使い方",
      questionCount: 95,
    },
    "ai-ontology-intro": {
      title: "オントロジー入門",
      questionCount: 60,
    },
    "ai-ontology-core": {
      title: "オントロジー基礎",
      questionCount: 107,
    },
  };

  function priceForQuestionCount(n) {
    const count = Math.max(0, Number(n) || 0);
    if (count <= FREE_SUBJECT_MAX_COUNT) return 0;
    if (count >= PRICE_CAP_COUNT) return PRICE_MAX;
    const span = PRICE_CAP_COUNT - FREE_SUBJECT_MAX_COUNT;
    const t = Math.min(1, (count - FREE_SUBJECT_MAX_COUNT) / span);
    const raw = PRICE_MIN + t * (PRICE_MAX - PRICE_MIN);
    return Math.round(raw / 10) * 10;
  }

  function getSubjectPriceYen(subjectId) {
    const meta = SUBJECT_CATALOG[subjectId];
    if (!meta) return null;
    return priceForQuestionCount(meta.questionCount);
  }

  function isSubjectFree(subjectId) {
    const yen = getSubjectPriceYen(subjectId);
    return yen === 0;
  }

  function getPlanLineItem(planType, subjectId) {
    if (planType === "pack") {
      return {
        name: PACK_PRODUCT_NAME,
        amountYen: PACK_PRICE_YEN,
        metadata: { planType: "pack", subjectId: "" },
      };
    }
    if (planType !== "subject" || !subjectId) return null;
    const meta = SUBJECT_CATALOG[subjectId];
    if (!meta) return null;
    const amountYen = getSubjectPriceYen(subjectId);
    if (amountYen == null || amountYen <= 0) return null;
    return {
      name: `ビジネス道場 — ${meta.title}`,
      amountYen,
      metadata: { planType: "subject", subjectId },
    };
  }

  function isKnownSubject(subjectId) {
    return Boolean(SUBJECT_CATALOG[subjectId]);
  }

  return {
    PACK_PRICE_YEN,
    PACK_TITLE,
    PACK_PRODUCT_NAME,
    PRICE_MIN,
    PRICE_MAX,
    FREE_SUBJECT_MAX_COUNT,
    PRICE_CAP_COUNT,
    /** @deprecated FREE_SUBJECT_MAX_COUNT を使用 */
    PRICE_FLOOR_COUNT: FREE_SUBJECT_MAX_COUNT,
    /** @deprecated PRICE_CAP_COUNT を使用 */
    PRICE_REF_COUNT: PRICE_CAP_COUNT,
    FREE_DAILY,
    SUBJECT_CATALOG,
    priceForQuestionCount,
    getSubjectPriceYen,
    isSubjectFree,
    getPlanLineItem,
    isKnownSubject,
  };
});
