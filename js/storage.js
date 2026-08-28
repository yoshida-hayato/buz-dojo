/**
 * 成績の保存（科目ごとにキーを分離）
 *
 * 未ログイン時: localStorage（科目別 KEY）
 * ログイン時  : Firestore users/{uid}/subjects/{subjectId}
 *
 * 方針:
 * - 回答のたびに必ず localStorage へ保存する（オフラインでも成績が残る）
 * - ログイン中は続けて Firestore へ送信する
 * - オフライン／送信失敗時は未同期フラグを立て、オンライン復帰・再ログイン時に再送する
 *
 * 保存形式（両方共通）:
 * {
 *   answered: 累計回答数,
 *   correct : 累計正解数,
 *   inputAnswered: 記述式（Tコード入力）の累計回答数,
 *   inputCorrect : 記述式の累計正解数,
 *   choiceLog: 選択式の正誤履歴（1=正解, 0=不正解）。推移グラフ用に長めに保持。
 *              段位の選択式正答率は末尾の RECENT_ACCURACY_WINDOW（500）件だけで判定,
 *   inputLog: 記述式の正誤履歴（1=正解, 0=不正解）。
 *             段位の記述式正答率は末尾の RECENT_INPUT_ACCURACY_WINDOW（100）件だけで判定,
 *   q: { 問題id: { a, c, k, ck: 選択式連続正解, ia, ic, ik: 記述式連続正解 }, ... },
 *   daily: { "YYYY-MM-DD": { a: その日の回答数, c: その日の正解数 } }
 * }
 * k / ck は選択式だけの連続正解（段位の習得率・成績の選択式習得に使用）。記述式では更新しない。
 * ik は記述式だけの連続正解。answered/correct は選択式・記述式を合わせた全体。
 */
/** 選択式の直近正答率（段位判定・推移グラフ）の窓幅 */
const RECENT_ACCURACY_WINDOW = 500;
/** 記述式の直近正答率（段位判定・推移グラフ）の窓幅 */
const RECENT_INPUT_ACCURACY_WINDOW = 100;

const QuizStorage = {
  KEY: "biz_dojo_stats_v1",
  /** クラウド未同期のとき、対象 uid を入れておく */
  PENDING_KEY: "biz_dojo_stats_pending_v1",
  ANON_ID_KEY: "biz_dojo_anon_id_v1",
  subjectId: null,
  mode: "local", // "local" | "cloud"
  uid: null,
  db: null,
  /** Firestore・localStorage 肥大化防止の上限（0/1 なので数万件でも軽い） */
  CHOICE_LOG_CAP: 50000,
  INPUT_LOG_CAP: 50000,
  stats: { answered: 0, correct: 0, inputAnswered: 0, inputCorrect: 0, choiceLog: [], inputLog: [], q: {}, daily: {} },
  DAILY_CAP: 800,
  DAILY_KEEP: 730,
  _onlineBound: false,
  _saveGeneration: 0,
  _anonSaveTimer: null,

  getAnonId() {
    try {
      let id = localStorage.getItem(this.ANON_ID_KEY);
      if (id && /^[a-zA-Z0-9_-]{16,64}$/.test(id)) return id;
      id =
        "a_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 12) +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem(this.ANON_ID_KEY, id);
      return id;
    } catch (e) {
      return null;
    }
  },

  /** 科目切替時に呼ぶ。storageKey は SUBJECT.storageKey を渡す */
  useSubject(subjectId, storageKey) {
    this.subjectId = subjectId || null;
    this.KEY = storageKey || (subjectId ? `biz_dojo_${subjectId}_stats_v1` : "biz_dojo_stats_v1");
    if (this.mode === "cloud" && this.uid && this.db) {
      return this._cloudLoad();
    }
    this.stats = this._loadLocal();
    return Promise.resolve(this.stats);
  },

  /** アプリ起動時に呼ぶ（まずはローカル成績で開始する） */
  init() {
    this.stats = this._loadLocal();
    this._bindOnlineSync();
  },

  load() {
    return this.stats;
  },

  /** 1問分の結果を記録する。isInput=true なら記述式（Tコード入力）としても集計する */
  record(questionId, isCorrect, isInput) {
    const s = this.stats;
    s.answered += 1;
    if (isCorrect) s.correct += 1;
    if (!s.q[questionId]) s.q[questionId] = { a: 0, c: 0, k: 0, ck: 0 };
    const qs = s.q[questionId];
    qs.a += 1;
    if (isCorrect) qs.c += 1;

    if (isInput) {
      // 記述式は ik のみ。選択式の習得（k/ck）は触らない
      s.inputAnswered = (s.inputAnswered || 0) + 1;
      if (isCorrect) s.inputCorrect = (s.inputCorrect || 0) + 1;
      qs.ia = (qs.ia || 0) + 1;
      if (isCorrect) {
        qs.ic = (qs.ic || 0) + 1;
        qs.ik = (qs.ik || 0) + 1;
      } else {
        qs.ik = 0;
      }
      if (!Array.isArray(s.inputLog)) s.inputLog = [];
      s.inputLog.push(isCorrect ? 1 : 0);
      if (s.inputLog.length > this.INPUT_LOG_CAP) {
        s.inputLog = s.inputLog.slice(-this.INPUT_LOG_CAP);
      }
    } else {
      // ck 未導入データ: 先に引き継いでから増減する（k>=2 なのに ck=1 へ落ちるのを防ぐ）
      if (typeof qs.ck !== "number") {
        qs.ck = qs.ia > 0 ? 0 : qs.k || 0;
      }
      if (isCorrect) {
        qs.k = (qs.k || 0) + 1;
        qs.ck = (qs.ck || 0) + 1;
      } else {
        qs.k = 0;
        qs.ck = 0;
      }
      if (!Array.isArray(s.choiceLog)) s.choiceLog = [];
      s.choiceLog.push(isCorrect ? 1 : 0);
      if (s.choiceLog.length > this.CHOICE_LOG_CAP) {
        s.choiceLog = s.choiceLog.slice(-this.CHOICE_LOG_CAP);
      }
    }
    this._bumpDaily(isCorrect);
    this._persist();
    return s;
  },

  /** 選択式で習得済みか（段位・成績用） */
  isChoiceMastered(s) {
    if (!s) return false;
    if (typeof s.ck === "number") return s.ck >= 2;
    // 移行前: 記述式未挑戦で k>=2 なら選択式習得とみなす
    return (s.k || 0) >= 2 && !(s.ia > 0);
  },

  /** 一度でも間違えたことのある問題IDの一覧（「間違えた問題だけ」モードで使う） */
  wrongIds() {
    return Object.entries(this.stats.q)
      .filter(([, s]) => s.a > s.c)
      .map(([id]) => id);
  },

  /** 習得済み（選択式で2回以上連続正解中）の問題ID ※段位用 */
  masteredIds() {
    return this.choiceMasteredIds();
  },

  /** 選択式で習得済み（選択式だけ2回以上連続正解中） */
  choiceMasteredIds() {
    return Object.entries(this.stats.q)
      .filter(([, s]) => this.isChoiceMastered(s))
      .map(([id]) => id);
  },

  /** 記述式で習得済み（記述式だけ2回以上連続正解中）の問題ID */
  inputMasteredIds() {
    return Object.entries(this.stats.q)
      .filter(([, s]) => (s.ik || 0) >= 2)
      .map(([id]) => id);
  },

  reset() {
    this.stats = this._empty();
    this._writeLocal();
    if (this.mode === "cloud") this._cloudSave();
    else localStorage.removeItem(this.KEY);
  },

  /**
   * ログイン時に呼ばれる。クラウドの成績に切り替える。
   * 科目未選択時はローカルのまま（subject サブコレクションへは書かない）。
   * クラウドにまだ成績がない場合は、このブラウザの成績を引き継ぐか確認する。
   * クイズ中はサーバ取得で上書きせず、現在の成績をクラウドへ保存するだけにする。
   * options.silent=true なら引き継ぎ確認を出さない（詳細ページなど）。
   */
  async switchToCloud(uid, db, options = {}) {
    this.uid = uid;
    this.db = db;
    this.mode = "cloud";
    this._bindOnlineSync();

    if (!this.subjectId) {
      this.stats = this._loadLocal();
      return;
    }

    try {
      const quizRunning =
        typeof quiz !== "undefined" &&
        quiz &&
        Array.isArray(quiz.questions) &&
        quiz.questions.length > 0 &&
        typeof $ === "function" &&
        $("screen-quiz") &&
        !$("screen-quiz").classList.contains("hidden");

      // オフラインで貯めた未同期成績がある場合は、サーバで上書きしない
      if (this._isPendingFor(uid)) {
        this.stats = this._loadLocal();
        await this._cloudSaveAsync();
        return;
      }

      if (quizRunning) {
        this._writeLocal();
        await this._cloudSaveAsync();
        return;
      }

      const ref = this._subjectRef();
      const doc = ref ? await ref.get() : null;
      if (doc && doc.exists) {
        const cloud = this._normalize(doc.data());
        const local = this._loadLocal();
        // 端末側の方が新しい（回答数が多い）場合は端末を優先して再送
        if (local.answered > cloud.answered) {
          this.stats = local;
          this._setPending(true);
          await this._cloudSaveAsync();
        } else {
          this.stats = cloud;
          this._writeLocal();
          this._setPending(false);
        }
      } else {
        const local = this._loadLocal();
        const canOfferLocal = !options.silent && local.answered > 0;
        if (
          canOfferLocal &&
          confirm(`このブラウザに保存されている成績（${local.answered}問分）をアカウントに引き継ぎますか？`)
        ) {
          this.stats = local;
        } else if (options.silent) {
          this.stats = local.answered > 0 ? local : this._empty();
        } else {
          this.stats = this._empty();
        }
        this._writeLocal();
        await this._cloudSaveAsync();
      }
    } catch (e) {
      console.error("クラウド成績の読み込みに失敗:", e);
      // オフライン等でもログイン状態は維持し、端末の成績で続行して後で同期する
      this.stats = this._loadLocal();
      this._writeLocal();
      this._setPending(true);
      if (navigator.onLine) {
        alert("成績のクラウド同期に失敗しました。端末内の成績で続行し、後で再送します。");
      }
    }
  },

  /** ログアウト時に呼ばれる。ローカル成績に戻す。 */
  switchToLocal() {
    this.mode = "local";
    this.uid = null;
    this.db = null;
    this.stats = this._loadLocal();
  },

  /** 未同期のクラウド保存があれば再送する（online イベント／手動呼び出し用） */
  async flushPendingCloudSave() {
    if (this.mode !== "cloud" || !this.uid || !this.db) return false;
    if (!this._isPendingFor(this.uid)) return false;
    if (!navigator.onLine) return false;
    return this._cloudSaveAsync();
  },

  /**
   * 科目選択画面用：現在の科目を切り替えずに成績だけ読む（local + ログイン時は Firestore）
   */
  async loadStatsForSubject(subjectId, storageKey) {
    const key = storageKey || (subjectId ? `biz_dojo_${subjectId}_stats_v1` : this.KEY);
    const local = this._loadFromKey(key);
    const user =
      typeof firebase !== "undefined" &&
      firebase.auth &&
      firebase.auth().currentUser;
    if (!user || !subjectId) return local;
    const db = this.db || (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore());
    if (!db) return local;
    try {
      const ref = db.collection("users").doc(user.uid).collection("subjects").doc(subjectId);
      const doc = await ref.get();
      if (doc.exists) return this._normalize(doc.data());
    } catch (e) {
      console.warn("科目成績のクラウド読込に失敗:", subjectId, e);
    }
    return local;
  },

  // ===== 内部処理 =====
  _empty() {
    return {
      answered: 0,
      correct: 0,
      inputAnswered: 0,
      inputCorrect: 0,
      choiceLog: [],
      inputLog: [],
      q: {},
      daily: {},
    };
  },

  _todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  },

  _normalizeDaily(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const a = Number(v && v.a) || 0;
      const c = Number(v && v.c) || 0;
      if (a > 0) out[k] = { a, c };
    }
    return this._pruneDailyMap(out);
  },

  _pruneDailyMap(daily) {
    const keys = Object.keys(daily).sort();
    if (keys.length <= this.DAILY_CAP) return daily;
    const drop = keys.length - this.DAILY_KEEP;
    for (let i = 0; i < drop; i++) delete daily[keys[i]];
    return daily;
  },

  _bumpDaily(isCorrect) {
    const s = this.stats;
    if (!s.daily || typeof s.daily !== "object" || Array.isArray(s.daily)) s.daily = {};
    const k = this._todayKey();
    if (!s.daily[k]) s.daily[k] = { a: 0, c: 0 };
    s.daily[k].a += 1;
    if (isCorrect) s.daily[k].c += 1;
    this._pruneDailyMap(s.daily);
  },

  _normalize(data) {
    const log = data && Array.isArray(data.choiceLog) ? data.choiceLog.map((v) => (v ? 1 : 0)) : [];
    const inputLog = data && Array.isArray(data.inputLog) ? data.inputLog.map((v) => (v ? 1 : 0)) : [];
    const q = {};
    const rawQ = (data && data.q) || {};
    for (const [id, s] of Object.entries(rawQ)) {
      const row = { ...(s || {}) };
      // ck 未導入: 記述式未挑戦なら旧 k を選択式連続として引き継ぐ
      if (typeof row.ck !== "number") {
        row.ck = row.ia > 0 ? 0 : row.k || 0;
      } else if (
        !(row.ia > 0) &&
        (row.k || 0) >= 2 &&
        (row.ck || 0) < 2 &&
        (row.k || 0) > (row.ck || 0)
      ) {
        // k>=2 なのに ck だけ短い＝ck導入時の引き継ぎ漏れで習得落ちした痕跡を修復
        row.ck = row.k;
      }
      q[id] = row;
    }
    return {
      answered: (data && data.answered) || 0,
      correct: (data && data.correct) || 0,
      inputAnswered: (data && data.inputAnswered) || 0,
      inputCorrect: (data && data.inputCorrect) || 0,
      choiceLog: log,
      inputLog,
      q,
      daily: this._normalizeDaily(data && data.daily),
    };
  },

  _loadLocalRaw() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) return this._normalize(JSON.parse(raw));
    } catch (e) { /* 壊れたデータは初期化する */ }
    return this._empty();
  },

  _loadFromKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return this._normalize(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return this._empty();
  },

  _loadLocal() {
    return this._loadLocalRaw();
  },

  _writeLocal() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.stats));
    } catch (e) {
      console.error("端末への成績保存に失敗:", e);
    }
  },

  _setPending(pending) {
    try {
      if (pending && this.uid) localStorage.setItem(this.PENDING_KEY, this.uid);
      else localStorage.removeItem(this.PENDING_KEY);
    } catch (e) { /* ignore */ }
  },

  _isPendingFor(uid) {
    try {
      return !!uid && localStorage.getItem(this.PENDING_KEY) === uid;
    } catch (e) {
      return false;
    }
  },

  _bindOnlineSync() {
    if (this._onlineBound) return;
    this._onlineBound = true;
    window.addEventListener("online", () => {
      this.flushPendingCloudSave();
    });
  },

  _persist() {
    // オフラインでも成績が残るよう、常に端末へ書く
    this._writeLocal();
    if (this.mode === "cloud") this._cloudSave();
    else this._scheduleAnonSave();
  },

  _getFirestoreDb() {
    if (this.db) return this.db;
    if (typeof FirebaseApp !== "undefined" && FirebaseApp.getDb) {
      try {
        return FirebaseApp.getDb();
      } catch (e) {
        /* ignore */
      }
    }
    if (
      typeof firebase !== "undefined" &&
      typeof FIREBASE_CONFIG !== "undefined" &&
      FIREBASE_CONFIG.apiKey
    ) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      return firebase.firestore();
    }
    return null;
  },

  _scheduleAnonSave() {
    if (this._anonSaveTimer) clearTimeout(this._anonSaveTimer);
    this._anonSaveTimer = setTimeout(() => {
      this._anonSaveTimer = null;
      void this._anonSaveAsync();
    }, 900);
  },

  async _anonSaveAsync() {
    if (this.mode === "cloud") return false;
    if (!this.subjectId) return false;
    const anonId = this.getAnonId();
    if (!anonId) return false;
    const db = this._getFirestoreDb();
    if (!db) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

    try {
      const ts =
        typeof firebase !== "undefined" &&
        firebase.firestore &&
        firebase.firestore.FieldValue &&
        firebase.firestore.FieldValue.serverTimestamp
          ? firebase.firestore.FieldValue.serverTimestamp()
          : null;
      const payload = this._buildCloudPayload();
      payload.isAnonymous = true;
      payload.anonId = anonId;
      if (ts) payload.lastActiveAt = ts;
      delete payload.email;

      const root = { isAnonymous: true, label: "未ログイン" };
      if (ts) {
        root.lastActiveAt = ts;
        root.updatedAt = ts;
      }
      await db.collection("anonUsers").doc(anonId).set(root, { merge: true });
      await db
        .collection("anonUsers")
        .doc(anonId)
        .collection("subjects")
        .doc(this.subjectId)
        .set(payload, { merge: true });
      return true;
    } catch (e) {
      console.warn("未ログイン成績の保存に失敗:", e);
      return false;
    }
  },

  _subjectRef() {
    if (!this.db || !this.uid || !this.subjectId) return null;
    return this.db.collection("users").doc(this.uid).collection("subjects").doc(this.subjectId);
  },

  async _cloudLoad() {
    const ref = this._subjectRef();
    if (!ref) {
      this.stats = this._loadLocal();
      return this.stats;
    }
    try {
      const doc = await ref.get();
      this.stats = doc.exists ? this._normalize(doc.data()) : this._empty();
      this._writeLocal();
      return this.stats;
    } catch (e) {
      console.error("クラウド成績の読み込みに失敗:", e);
      this.stats = this._loadLocal();
      return this.stats;
    }
  },

  _buildCloudPayload() {
    const payload = {
      answered: this.stats.answered,
      correct: this.stats.correct,
      inputAnswered: this.stats.inputAnswered || 0,
      inputCorrect: this.stats.inputCorrect || 0,
      choiceLog: Array.isArray(this.stats.choiceLog) ? this.stats.choiceLog : [],
      inputLog: Array.isArray(this.stats.inputLog) ? this.stats.inputLog : [],
      q: this.stats.q || {},
      daily: this._normalizeDaily(this.stats.daily),
      subjectId: this.subjectId,
    };
    const user =
      typeof firebase !== "undefined" &&
      firebase.auth &&
      firebase.auth().currentUser;
    if (user) {
      payload.email = user.email || null;
      if (
        typeof firebase.firestore !== "undefined" &&
        firebase.firestore.FieldValue &&
        firebase.firestore.FieldValue.serverTimestamp
      ) {
        payload.lastActiveAt = firebase.firestore.FieldValue.serverTimestamp();
      }
    }
    return payload;
  },

  async _ensureUserProfile() {
    if (!this.db || !this.uid) return;
    const user =
      typeof firebase !== "undefined" &&
      firebase.auth &&
      firebase.auth().currentUser;
    if (!user) return;
    try {
      const patch = {
        email: user.email || null,
        displayName: user.displayName || null,
      };
      if (
        firebase.firestore.FieldValue &&
        firebase.firestore.FieldValue.serverTimestamp
      ) {
        patch.lastActiveAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      await this.db.collection("users").doc(this.uid).set(patch, { merge: true });
    } catch (e) {
      console.warn("ユーザプロフィール更新に失敗:", e);
    }
  },

  _cloudSave() {
    void this._cloudSaveAsync();
  },

  async _cloudSaveAsync() {
    if (!this.db || !this.uid) return false;
    const ref = this._subjectRef();
    if (!ref) return false;
    this._writeLocal();

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this._setPending(true);
      return false;
    }

    this._saveGeneration += 1;
    const gen = this._saveGeneration;
    // 送信完了までは未同期扱い（途中で落ちても再送対象になる）
    this._setPending(true);
    try {
      await this._ensureUserProfile();
      await ref.set(this._buildCloudPayload());
      // より新しい保存が走っていれば、完了フラグはそちらに任せる
      if (gen === this._saveGeneration) this._setPending(false);
      return true;
    } catch (e) {
      this._setPending(true);
      console.error("クラウド保存に失敗:", e);
      return false;
    }
  },
};
