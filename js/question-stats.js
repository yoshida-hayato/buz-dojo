/**
 * 全ユーザ共通の問題別正答率
 * 新: questionStats/{subjectId}/questions/{questionId}
 * 旧: questionStats/{questionId}（読み取りのみフォールバック）
 *
 * attempts/correct … 選択式
 * inputAttempts/inputCorrect … 記述式（別集計）
 *
 * 表示は「自分の今回の回答を含まない直前までの集計」。
 * 問題表示時に prefetch し、回答直後はキャッシュを即表示する（書き込み待ちなし）。
 */
const QuestionStats = (function () {
  const CACHE = new Map();
  const INFLIGHT = new Map();

  function firebaseReady() {
    return (
      typeof firebase !== "undefined" &&
      typeof FIREBASE_CONFIG !== "undefined" &&
      FIREBASE_CONFIG.apiKey
    );
  }

  function getDb() {
    if (!firebaseReady()) return null;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.firestore();
  }

  function isAvailable() {
    return !!getDb();
  }

  function docRef(db, questionId, subjectId) {
    return QuestionStatsPaths.docRef(db, questionId, subjectId);
  }

  async function readStat(db, questionId, subjectId) {
    const snap = await docRef(db, questionId, subjectId).get();
    if (snap.exists) return normalizeStat(snap.data());
    const legacy = await QuestionStatsPaths.legacyDocRef(db, questionId).get();
    if (legacy.exists) return normalizeStat(legacy.data());
    return normalizeStat({});
  }

  function normalizeStat(data) {
    return {
      attempts: data.attempts || 0,
      correct: data.correct || 0,
      inputAttempts: data.inputAttempts || 0,
      inputCorrect: data.inputCorrect || 0,
    };
  }

  /** キャッシュにあれば同期で返す（無ければ null） */
  function peek(questionId) {
    const cached = CACHE.get(questionId);
    return cached ? { ...cached } : null;
  }

  /** 集計を取得（キャッシュ優先） */
  async function fetch(questionId, subjectId) {
    const db = getDb();
    if (!db || !questionId) return null;

    const cached = CACHE.get(questionId);
    if (cached) return { ...cached };

    if (INFLIGHT.has(questionId)) {
      const stat = await INFLIGHT.get(questionId);
      return stat ? { ...stat } : null;
    }

    const promise = readStat(db, questionId, subjectId)
      .then((stat) => {
        CACHE.set(questionId, { ...stat });
        return { ...stat };
      })
      .finally(() => {
        INFLIGHT.delete(questionId);
      });

    INFLIGHT.set(questionId, promise);
    return promise;
  }

  /** 問題表示時など、裏で先読み（失敗は無視） */
  function prefetch(questionId) {
    if (!questionId || !isAvailable()) return;
    if (CACHE.has(questionId) || INFLIGHT.has(questionId)) return;
    fetch(questionId).catch(() => {});
  }

  /**
   * 1回答分を集計に加算（ログイン不要）。表示とは独立して裏で呼ぶ。
   * 同一 questionId の同時呼び出しは1回にまとめる。
   */
  const RECORD_INFLIGHT = new Map();

  async function recordAttempt(questionId, isCorrect, isInput, meta) {
    const db = getDb();
    if (!db || !questionId) return null;

    const key =
      String(questionId) +
      "|" +
      (isInput ? "i" : "c") +
      "|" +
      (isCorrect ? "1" : "0");
    if (RECORD_INFLIGHT.has(key)) return RECORD_INFLIGHT.get(key);

    // 表示用キャッシュは先に楽観更新（同時呼び出しの二重加算を防ぐ）
    const base = CACHE.get(questionId) || normalizeStat({});
    const next = { ...base };
    if (isInput) {
      next.inputAttempts = (next.inputAttempts || 0) + 1;
      if (isCorrect) next.inputCorrect = (next.inputCorrect || 0) + 1;
    } else {
      next.attempts = (next.attempts || 0) + 1;
      if (isCorrect) next.correct = (next.correct || 0) + 1;
    }
    CACHE.set(questionId, next);

    const promise = (async () => {
      const subjectId =
        meta && meta.subjectId
          ? meta.subjectId
          : QuestionStatsPaths.guessSubjectId(questionId);
      const ref = docRef(db, questionId, subjectId);
      const patch = isInput
        ? {
            inputAttempts: firebase.firestore.FieldValue.increment(1),
            inputCorrect: firebase.firestore.FieldValue.increment(isCorrect ? 1 : 0),
          }
        : {
            attempts: firebase.firestore.FieldValue.increment(1),
            correct: firebase.firestore.FieldValue.increment(isCorrect ? 1 : 0),
          };
      if (meta && meta.subjectId) patch.subjectId = String(meta.subjectId);
      await ref.set(patch, { merge: true });
      return true;
    })().finally(() => {
      RECORD_INFLIGHT.delete(key);
    });

    RECORD_INFLIGHT.set(key, promise);
    return promise;
  }

  /**
   * 正答率を整形。isInput=true なら記述式フィールドを使う。
   * @returns {{ pct: number, attempts: number } | null}
   */
  function formatRate(stat, isInput) {
    if (!stat) return null;
    const attempts = isInput ? stat.inputAttempts || 0 : stat.attempts || 0;
    const correct = isInput ? stat.inputCorrect || 0 : stat.correct || 0;
    if (attempts < 1) return null;
    const pct = Math.round((correct / attempts) * 100);
    return { pct, attempts };
  }

  return { isAvailable, peek, fetch, prefetch, recordAttempt, formatRate };
})();
