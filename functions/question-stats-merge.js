const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  SUBJECT_IDS,
  guessSubjectId,
  isSubjectDocId,
  docRef,
} = require("./question-stats-paths");

const REGION = "asia-northeast1";
const SERVICE_ACCOUNT = "firebase-adminsdk-fbsvc@buz-dojo.iam.gserviceaccount.com";
const ADMIN_EMAIL = "yoshida.hayato0126@gmail.com";

const SOURCES = [
  { projectId: "sap-dojo", key: "sap-dojo" },
  { projectId: "gakusyu-dojo", key: "gakusyu-dojo" },
];

const META_REF = () =>
  admin.firestore().collection("system").doc("questionStatsLegacyMerge");

const PAGE_SIZE = 400;
const crossApps = {};

function getCrossApp(projectId) {
  if (crossApps[projectId]) return crossApps[projectId];
  crossApps[projectId] = admin.initializeApp({ projectId }, `qs-cross-${projectId}`);
  return crossApps[projectId];
}

function normalize(data) {
  const d = data || {};
  return {
    attempts: Number(d.attempts) || 0,
    correct: Number(d.correct) || 0,
    inputAttempts: Number(d.inputAttempts) || 0,
    inputCorrect: Number(d.inputCorrect) || 0,
  };
}

function assertAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です");
  }
  const email = (request.auth.token && request.auth.token.email) || "";
  if (email !== ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "管理者のみ実行できます");
  }
}

/**
 * 完了フラグを読む。
 * 旧バグ: `sources.sap-dojo` というドット付きフィールド名で書いていたため
 * nested の meta.sources[key] が常に空 → 毎回再合算されていた。
 */
function readSourcesMap(meta) {
  const out = {};
  const m = meta || {};
  if (m.sources && typeof m.sources === "object") {
    Object.keys(m.sources).forEach((k) => {
      out[k] = m.sources[k];
    });
  }
  for (const source of SOURCES) {
    const legacy = m[`sources.${source.key}`];
    if (legacy && !out[source.key]) out[source.key] = legacy;
  }
  return out;
}

function isPermissionError(err) {
  const code = err && (err.code || err.status);
  return code === 7 || code === "permission-denied" || code === 403;
}

async function listAllQuestionStats(db) {
  const out = [];
  let last = null;
  for (;;) {
    let q = db
      .collection("questionStats")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      out.push({ id: doc.id, data: doc.data() });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return out;
}

/** 科目別サブコレクション + レガシーフラットを統合して列挙 */
async function listAllQuestionStatsBuz(buzDb) {
  const out = [];
  const seen = new Set();

  for (const sid of SUBJECT_IDS) {
    const snap = await buzDb
      .collection("questionStats")
      .doc(sid)
      .collection("questions")
      .get();
    snap.forEach((doc) => {
      seen.add(doc.id);
      out.push({ id: doc.id, data: doc.data(), subjectId: sid });
    });
  }

  const legacy = await listAllQuestionStats(buzDb);
  for (const item of legacy) {
    if (seen.has(item.id)) continue;
    if (isSubjectDocId(item.id)) continue;
    const data = item.data || {};
    const hasStats =
      Number(data.attempts) > 0 ||
      Number(data.correct) > 0 ||
      Number(data.inputAttempts) > 0 ||
      Number(data.inputCorrect) > 0;
    if (!hasStats) continue;
    out.push({
      id: item.id,
      data,
      subjectId: guessSubjectId(item.id, data.subjectId),
    });
  }

  return out;
}

/**
 * ソースの集計を buz に加算（1回限り）。
 * attempts = 既存 + ソース（二重計上防止は meta.sources[key].mergedAt で担保）
 */
async function addSourceIntoBuz(buzDb, source) {
  const srcDb = getCrossApp(source.projectId).firestore();
  const docs = await listAllQuestionStats(srcDb);
  let written = 0;
  let skipped = 0;

  for (let i = 0; i < docs.length; i += PAGE_SIZE) {
    const chunk = docs.slice(i, i + PAGE_SIZE);
    const refs = chunk.map((d) =>
      docRef(buzDb, d.id, guessSubjectId(d.id, d.data && d.data.subjectId))
    );
    const snaps = await buzDb.getAll(...refs);

    const batch = buzDb.batch();
    let batchOps = 0;
    for (let j = 0; j < chunk.length; j++) {
      const srcStat = normalize(chunk[j].data);
      if (
        srcStat.attempts === 0 &&
        srcStat.correct === 0 &&
        srcStat.inputAttempts === 0 &&
        srcStat.inputCorrect === 0
      ) {
        skipped += 1;
        continue;
      }

      const existing = snaps[j].exists ? normalize(snaps[j].data()) : normalize({});
      batch.set(
        refs[j],
        {
          attempts: existing.attempts + srcStat.attempts,
          correct: existing.correct + srcStat.correct,
          inputAttempts: existing.inputAttempts + srcStat.inputAttempts,
          inputCorrect: existing.inputCorrect + srcStat.inputCorrect,
        },
        { merge: true }
      );
      batchOps += 1;
      written += 1;
    }
    if (batchOps > 0) await batch.commit();
  }

  return { source: source.key, scanned: docs.length, written, skipped };
}

/**
 * 再合算バグで約4倍になった attempts 等を ÷4 で戻す（4で割り切れるドキュメントのみ）。
 */
async function divideQuadrupledStats(buzDb) {
  const docs = await listAllQuestionStatsBuz(buzDb);
  let fixed = 0;
  let skipped = 0;

  for (let i = 0; i < docs.length; i += PAGE_SIZE) {
    const chunk = docs.slice(i, i + PAGE_SIZE);
    const batch = buzDb.batch();
    let batchOps = 0;

    for (const item of chunk) {
      const s = normalize(item.data);
      const total = s.attempts + s.correct + s.inputAttempts + s.inputCorrect;
      if (total === 0) {
        skipped += 1;
        continue;
      }
      const divisible =
        s.attempts % 4 === 0 &&
        s.correct % 4 === 0 &&
        s.inputAttempts % 4 === 0 &&
        s.inputCorrect % 4 === 0;
      if (!divisible) {
        skipped += 1;
        continue;
      }
      batch.set(
        docRef(buzDb, item.id, item.subjectId),
        {
          attempts: s.attempts / 4,
          correct: s.correct / 4,
          inputAttempts: s.inputAttempts / 4,
          inputCorrect: s.inputCorrect / 4,
        },
        { merge: true }
      );
      batchOps += 1;
      fixed += 1;
    }
    if (batchOps > 0) await batch.commit();
  }

  return { scanned: docs.length, fixed, skipped };
}

/**
 * SAP道場・学習道場のみんなの正答率をビジネス道場へ合算する（ソースごと1回限り）。
 */
function createMergeLegacyQuestionStatsExport() {
  return onCall(
    {
      region: REGION,
      cors: true,
      serviceAccount: SERVICE_ACCOUNT,
      timeoutSeconds: 540,
      memory: "512MiB",
    },
    async (request) => {
      // 任意ログインだと再合算のリスクがあるため管理者のみ
      assertAdmin(request);

      const force = !!(request.data && request.data.force);
      const buzDb = admin.firestore();
      const metaRef = META_REF();
      const metaSnap = await metaRef.get();
      const meta = metaSnap.exists ? metaSnap.data() : {};
      const already = readSourcesMap(meta);

      const results = [];
      const errors = [];
      const skipped = [];

      for (const source of SOURCES) {
        if (!force && already[source.key] && already[source.key].mergedAt) {
          skipped.push({ source: source.key, reason: "already_merged" });
          continue;
        }

        try {
          const result = await addSourceIntoBuz(buzDb, source);
          results.push(result);
          // nested map で保存（ドット付きフィールド名は使わない）
          await metaRef.set(
            {
              sources: {
                [source.key]: {
                  mergedAt: admin.firestore.FieldValue.serverTimestamp(),
                  scanned: result.scanned,
                  written: result.written,
                  skipped: result.skipped,
                  by: request.auth.token.email || request.auth.uid,
                },
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (err) {
          console.error(`merge questionStats from ${source.key}:`, err);
          if (isPermissionError(err)) {
            errors.push({
              source: source.key,
              reason: "access_denied",
              hint: `${source.projectId} に Datastore ユーザー権限を付与してください`,
            });
          } else {
            errors.push({ source: source.key, reason: "error", message: err.message });
          }
        }
      }

      return {
        ok: errors.length === 0,
        imported: results.some((r) => r.written > 0),
        results,
        skipped,
        errors,
      };
    }
  );
}

/**
 * 再合算で4倍になった questionStats を ÷4 で修復（管理者・1回想定）。
 */
function createRepairQuestionStatsQuadrupleExport() {
  return onCall(
    {
      region: REGION,
      cors: true,
      serviceAccount: SERVICE_ACCOUNT,
      timeoutSeconds: 540,
      memory: "512MiB",
    },
    async (request) => {
      assertAdmin(request);

      const force = !!(request.data && request.data.force);
      const buzDb = admin.firestore();
      const metaRef = META_REF();
      const metaSnap = await metaRef.get();
      const meta = metaSnap.exists ? metaSnap.data() : {};

      if (!force && meta.scaleRepairV1At) {
        return {
          ok: true,
          skipped: true,
          reason: "already_repaired",
          repairedAt: meta.scaleRepairV1At,
        };
      }

      const result = await divideQuadrupledStats(buzDb);
      await metaRef.set(
        {
          scaleRepairV1At: admin.firestore.FieldValue.serverTimestamp(),
          scaleRepairV1: {
            ...result,
            by: request.auth.token.email || request.auth.uid,
            factor: 4,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { ok: true, skipped: false, ...result };
    }
  );
}

module.exports = {
  createMergeLegacyQuestionStatsExport,
  createRepairQuestionStatsQuadrupleExport,
};
