const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  emptyStats,
  normalizeStats,
  mergeStats,
  statsChanged,
  buildSubjectPayload,
} = require("./stats-merge");

const REGION = "asia-northeast1";
const SERVICE_ACCOUNT = "firebase-adminsdk-fbsvc@buz-dojo.iam.gserviceaccount.com";

const SAP_DOJO_PROJECT = "sap-dojo";
const GAKUSYU_DOJO_PROJECT = "gakusyu-dojo";

/** 学習道場 → ビジネス道場で取り込む科目（ID が一致するもの） */
const GAKUSYU_SUBJECT_IDS = ["biz-career", "windows-shortcuts"];

const crossApps = {};

function getCrossApp(projectId) {
  if (crossApps[projectId]) return crossApps[projectId];
  crossApps[projectId] = admin.initializeApp({ projectId }, `cross-${projectId}`);
  return crossApps[projectId];
}

function isPermissionError(err) {
  const code = err && (err.code || err.status);
  return code === 7 || code === "permission-denied" || code === 403;
}

/** 他プロジェクトでメールから Auth uid を解決（失敗時 null） */
async function resolveUidByEmail(app, email) {
  try {
    const user = await app.auth().getUserByEmail(email);
    return user.uid;
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      console.warn(`${app.options.projectId} Auth lookup:`, err.code || err.message);
    }
    return null;
  }
}

async function findSapDojoStats(email) {
  const sapApp = getCrossApp(SAP_DOJO_PROJECT);
  const sapDb = sapApp.firestore();

  const uid = await resolveUidByEmail(sapApp, email);
  if (uid) {
    const doc = await sapDb.collection("users").doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      if ((data.answered || 0) > 0) return { data, uid };
    }
  }

  const snap = await sapDb.collection("users").where("email", "==", email).limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    const data = doc.data();
    if ((data.answered || 0) > 0) return { data, uid: doc.id };
  }
  return null;
}

function emailsMatch(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * 学習道場: users/{uid}/subjects/{subjectId}
 * 1) Auth で uid
 * 2) collectionGroup(email)
 * 3) users 配下を走査（小規模向け・Datastore 権限のみで可）
 */
async function findGakusyuSubjectStats(email) {
  const app = getCrossApp(GAKUSYU_DOJO_PROJECT);
  const db = app.firestore();
  const out = {};

  const uid = await resolveUidByEmail(app, email);
  if (uid) {
    for (const subjectId of GAKUSYU_SUBJECT_IDS) {
      const doc = await db.collection("users").doc(uid).collection("subjects").doc(subjectId).get();
      if (doc.exists && (doc.data().answered || 0) > 0) {
        out[subjectId] = { data: doc.data(), uid };
      }
    }
    if (Object.keys(out).length > 0) {
      console.info("gakusyu found via Auth", Object.keys(out));
      return out;
    }
  }

  // collectionGroup（インデックスがある場合）
  try {
    const snap = await db
      .collectionGroup("subjects")
      .where("email", "==", email)
      .limit(20)
      .get();
    for (const doc of snap.docs) {
      const subjectId = doc.id;
      if (!GAKUSYU_SUBJECT_IDS.includes(subjectId)) continue;
      const data = doc.data();
      if ((data.answered || 0) > 0) {
        out[subjectId] = { data, uid: doc.ref.parent.parent.id };
      }
    }
    if (Object.keys(out).length > 0) {
      console.info("gakusyu found via collectionGroup", Object.keys(out));
      return out;
    }
  } catch (err) {
    console.warn("gakusyu collectionGroup fallback:", err.message);
  }

  // users を走査して subjects.email / 親 email を照合
  try {
    const usersSnap = await db.collection("users").limit(1000).get();
    console.info("gakusyu users scan count=", usersSnap.size);
    const byUid = {};
    for (const userDoc of usersSnap.docs) {
      const parentEmail = userDoc.data() && userDoc.data().email;
      for (const subjectId of GAKUSYU_SUBJECT_IDS) {
        const doc = await userDoc.ref.collection("subjects").doc(subjectId).get();
        if (!doc.exists) continue;
        const data = doc.data();
        if ((data.answered || 0) <= 0) continue;
        if (!byUid[userDoc.id]) byUid[userDoc.id] = {};
        byUid[userDoc.id][subjectId] = { data, uid: userDoc.id, email: data.email || parentEmail || null };
        if (emailsMatch(data.email, email) || emailsMatch(parentEmail, email)) {
          out[subjectId] = { data, uid: userDoc.id };
        }
      }
    }
    if (Object.keys(out).length > 0) {
      console.info("gakusyu found via users scan", Object.keys(out));
      return out;
    }

    // メール未保存の旧データ向け: 成績があるユーザーが1人だけならそれを採用
    const uidsWithStats = Object.keys(byUid);
    if (uidsWithStats.length === 1) {
      console.warn("gakusyu falling back to sole user with stats:", uidsWithStats[0]);
      for (const [subjectId, row] of Object.entries(byUid[uidsWithStats[0]])) {
        out[subjectId] = { data: row.data, uid: row.uid };
      }
      return out;
    }

    console.warn(
      "gakusyu no matching subjects for email; usersWithStats=",
      uidsWithStats.length,
      "sampleEmails=",
      uidsWithStats.slice(0, 3).map((u) => {
        const first = Object.values(byUid[u])[0];
        return first && first.email;
      })
    );
  } catch (err) {
    console.warn("gakusyu users scan fallback:", err.message);
    throw err;
  }

  return out;
}

async function mergeSubjectFromSource(
  buzRef,
  email,
  subjectId,
  sourceStats,
  sourceUid,
  flagField,
  sourceName,
  options = {}
) {
  const buzDoc = await buzRef.get();
  const current = buzDoc.exists ? normalizeStats(buzDoc.data()) : emptyStats();
  if (!options.force && buzDoc.exists && buzDoc.data()[flagField]) {
    return { imported: false, reason: "already_imported", answered: current.answered, subjectId };
  }

  const incoming = normalizeStats(sourceStats);
  if (incoming.answered === 0) {
    return { imported: false, reason: "no_data", answered: current.answered, subjectId };
  }

  const merged = mergeStats(current, incoming);
  if (!statsChanged(current, merged)) {
    await buzRef.set(
      {
        [flagField]: admin.firestore.FieldValue.serverTimestamp(),
        legacySource: sourceName,
      },
      { merge: true }
    );
    return { imported: false, reason: "already_up_to_date", answered: current.answered, subjectId };
  }

  await buzRef.set(
    {
      ...buildSubjectPayload(merged, subjectId, email),
      [flagField]: admin.firestore.FieldValue.serverTimestamp(),
      legacySource: sourceName,
      legacyFromUid: sourceUid || null,
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    imported: true,
    answered: merged.answered,
    previous: current.answered,
    sourceAnswered: incoming.answered,
    subjectId,
  };
}

async function importFromSapDojo(buzDb, uid, email) {
  const buzRef = buzDb.collection("users").doc(uid).collection("subjects").doc("sap");
  try {
    const sapFound = await findSapDojoStats(email);
    if (!sapFound) {
      return { imported: false, reason: "no_sap_data" };
    }
    return await mergeSubjectFromSource(
      buzRef,
      email,
      "sap",
      sapFound.data,
      sapFound.uid,
      "sapLegacyImportedAt",
      "sap-dojo"
    );
  } catch (err) {
    if (isPermissionError(err)) {
      return {
        imported: false,
        reason: "sap_dojo_access_denied",
        hint: "sap-dojo に Datastore ユーザー権限を付与してください",
      };
    }
    throw err;
  }
}

async function importFromGakusyuDojo(buzDb, uid, email, options = {}) {
  try {
    const found = await findGakusyuSubjectStats(email);
    const subjects = {};
    let anyImported = false;

    for (const subjectId of GAKUSYU_SUBJECT_IDS) {
      const src = found[subjectId];
      if (!src) {
        subjects[subjectId] = { imported: false, reason: "no_data", subjectId };
        continue;
      }
      const buzRef = buzDb.collection("users").doc(uid).collection("subjects").doc(subjectId);
      const result = await mergeSubjectFromSource(
        buzRef,
        email,
        subjectId,
        src.data,
        src.uid,
        "gakusyuLegacyImportedAt",
        "gakusyu-dojo",
        options
      );
      subjects[subjectId] = result;
      if (result.imported) anyImported = true;
    }

    return { imported: anyImported, subjects, foundSubjects: Object.keys(found) };
  } catch (err) {
    if (isPermissionError(err)) {
      return {
        imported: false,
        reason: "gakusyu_dojo_access_denied",
        hint: "gakusyu-dojo に Datastore ユーザー権限を付与してください",
      };
    }
    throw err;
  }
}

/** SAP道場 + 学習道場の成績を、ログインユーザーの対応科目へ取り込む */
function createImportLegacyDojoStatsExport() {
  return onCall(
    {
      region: REGION,
      cors: true,
      serviceAccount: SERVICE_ACCOUNT,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "ログインが必要です");
      }

      const email = request.auth.token.email;
      if (!email) {
        return { imported: false, reason: "no_email" };
      }

      const uid = request.auth.uid;
      const buzDb = admin.firestore();
      const force = !!(request.data && request.data.force);

      try {
        const [sap, gakusyu] = await Promise.all([
          importFromSapDojo(buzDb, uid, email),
          importFromGakusyuDojo(buzDb, uid, email, { force }),
        ]);

        return {
          imported: !!(sap.imported || gakusyu.imported),
          sap,
          gakusyu,
        };
      } catch (err) {
        console.error("importLegacyDojoStats failed:", err);
        throw new HttpsError(
          "internal",
          "過去アプリの成績取り込みに失敗しました。しばらくしてから再度お試しください。"
        );
      }
    }
  );
}

/** 後方互換: SAP道場のみ */
function createImportSapDojoStatsExport() {
  return onCall(
    {
      region: REGION,
      cors: true,
      serviceAccount: SERVICE_ACCOUNT,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "ログインが必要です");
      }
      const email = request.auth.token.email;
      if (!email) return { imported: false, reason: "no_email" };
      try {
        return await importFromSapDojo(admin.firestore(), request.auth.uid, email);
      } catch (err) {
        console.error("importSapDojoStats failed:", err);
        if (isPermissionError(err)) {
          return { imported: false, reason: "sap_dojo_access_denied" };
        }
        throw new HttpsError("internal", "SAP道場の成績取り込みに失敗しました。");
      }
    }
  );
}

module.exports = {
  createImportLegacyDojoStatsExport,
  createImportSapDojoStatsExport,
};
