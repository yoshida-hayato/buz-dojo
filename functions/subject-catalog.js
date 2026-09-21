/**
 * マスタ catalog.js から問題数を取得（Checkout 用・メモリキャッシュ）
 */
const SUBJECT_CONTENT_URLS = {
  sap: "https://sap-dojo.web.app/data/catalog.js",
  "windows-shortcuts":
    "https://gakusyu-dojo.web.app/subjects/windows-shortcuts/catalog.js",
  "biz-career": "https://gakusyu-dojo.web.app/subjects/biz-career/catalog.js",
  "excel-functions":
    "https://gakusyu-dojo.web.app/subjects/excel-functions/catalog.js",
  "outlook-mail":
    "https://gakusyu-dojo.web.app/subjects/outlook-mail/catalog.js",
  "teams-collab":
    "https://gakusyu-dojo.web.app/subjects/teams-collab/catalog.js",
  "ai-ontology-intro":
    "https://gakusyu-dojo.web.app/subjects/ai-ontology-intro/catalog.js",
  "ai-ontology-core":
    "https://gakusyu-dojo.web.app/subjects/ai-ontology-core/catalog.js",
};

const catalogCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function fallbackCount(subjectId, pricing) {
  const meta = pricing.SUBJECT_CATALOG && pricing.SUBJECT_CATALOG[subjectId];
  return meta ? Number(meta.questionCount) || 0 : 0;
}

async function fetchCatalogCount(subjectId, pricing) {
  const url = SUBJECT_CONTENT_URLS[subjectId];
  if (!url) return fallbackCount(subjectId, pricing);

  const cached = catalogCache.get(subjectId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.count;
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("catalog fetch failed");
    const text = await res.text();
    const m = text.match(/questionCount:\s*(\d+)/);
    const count = m ? Number(m[1]) : 0;
    if (count > 0) {
      catalogCache.set(subjectId, { at: Date.now(), count });
      return count;
    }
  } catch (err) {
    console.warn("catalog.js fetch failed:", subjectId, err.message || err);
  }
  return fallbackCount(subjectId, pricing);
}

async function getSubjectPriceYenLive(subjectId, pricing) {
  const count = await fetchCatalogCount(subjectId, pricing);
  return pricing.priceForQuestionCount(count);
}

async function getPlanLineItemLive(planType, subjectId, pricing) {
  if (planType === "pack") {
    return pricing.getPlanLineItem("pack", "");
  }
  if (planType !== "subject" || !subjectId || !pricing.isKnownSubject(subjectId)) {
    return null;
  }
  const meta = pricing.SUBJECT_CATALOG[subjectId];
  const amountYen = await getSubjectPriceYenLive(subjectId, pricing);
  if (amountYen == null || amountYen <= 0) return null;
  return {
    name: `ビジネス道場 — ${meta.title}`,
    amountYen,
    metadata: { planType: "subject", subjectId },
  };
}

module.exports = {
  fetchCatalogCount,
  getSubjectPriceYenLive,
  getPlanLineItemLive,
};
