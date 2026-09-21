/**
 * 成績の保存（科目ごとにキーを分離）
 *
 * 未ログイン時: localStorage（科目別 KEY）
 * ログイン時  : Firestore users/{uid}/subjects/{subjectId}（サマリ）
 *               + users/{uid}/subjects/{subjectId}/detail/stats（q・ログ）
 *
 * 方針:
 * - 回答のたびに必ず localStorage へ保存する（オフラインでも成績が残る）
 * - ログイン中は続けて Firestore へ送信する
 * - オフライン／送信失敗時は未同期件数を増やし、オンライン復帰で再送→0 にする
 * - 未ログインは端末のみ（anonUsers への自動アップロードはしない）
 * - ログアウト時は未送信を送ってから端末成績をクリアし、未ログインへ引き継がない
 *
 * 保存形式（両方共通）:
 * {
 *   answered: 累計回答数,
 *   correct : 累計正解数,
 *   inputAnswered: 記述式（Tコード入力）の累計回答数,
 *   inputCorrect : 記述式の累計正解数,
 *   masteredChoice: 選択式習得済み（ck>=2）の問題数,
 *   masteredInput : 記述式習得済み（ik>=2）の問題数,
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
/** Firestore 成績のスキーマ（2=サマリと detail 分離） */
const STATS_SCHEMA_VERSION = 2;
const STATS_DETAIL_DOC_ID = "stats";

const QuizStorage = {
  KEY: "biz_dojo_stats_v1",
  /** クラウド未同期のとき、対象 uid を入れておく */
  PENDING_KEY: "biz_dojo_stats_pending_v1",
  /** 未送信の回答数 { uid, count } */
  PENDING_COUNT_KEY: "biz_dojo_stats_pending_count_v1",
  ANON_ID_KEY: "biz_dojo_anon_id_v1",
  subjectId: null,
  mode: "local", // "local" | "cloud"
  uid: null,
  db: null,
  _syncUiTimer: null,
  /** Firestore・localStorage 肥大化防止の上限（0/1 なので数万件でも軽い） */
  CHOICE_LOG_CAP: 50000,
  INPUT_LOG_CAP: 50000,
  stats: {
    answered: 0,
    correct: 0,
    inputAnswered: 0,
    inputCorrect: 0,
    masteredChoice: 0,
    masteredInput: 0,
    choiceLog: [],
    inputLog: [],
    q: {},
    daily: {},
  },
  DAILY_CAP: 800,
  DAILY_KEEP: 730,
  _onlineBound: false,
  _saveGeneration: 0,
  _anonSaveTimer: null,
  _allSummariesCache: null,

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
    // A: クラウド待ちでも local を先に載せる（ホーム次の一手の先描画用）
    this.stats = this._scrubPollutedStats(this.subjectId, this._loadLocal());
    if (this._looksLikeSapPollution(this.subjectId, this._loadFromKey(this.KEY))) {
      this._writeLocal(this.KEY, this.stats);
    }
    if (this.mode === "cloud" && this.uid && this.db) {
      return this._cloudLoad();
    }
    return Promise.resolve(this.stats);
  },

  /** アプリ起動時に呼ぶ（まずはローカル成績で開始する） */
  init() {
    this.stats = this._loadLocal();
    this._bindOnlineSync();
    this.updateSyncStatusUi();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && this.mode === "cloud") {
          void this.flushPendingCloudSave();
        }
      });
    }
  },

  /** 未送信の回答数（ログイン中のみ意味がある） */
  getUnsyncedCount() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.PENDING_COUNT_KEY) || "null");
      if (!raw || typeof raw !== "object") return 0;
      if (this.uid && raw.uid && raw.uid !== this.uid) return 0;
      return Math.max(0, Number(raw.count) || 0);
    } catch (e) {
      return 0;
    }
  },

  _bumpUnsynced(n) {
    if (this.mode !== "cloud" || !this.uid) return;
    const next = this.getUnsyncedCount() + Math.max(1, Number(n) || 1);
    try {
      localStorage.setItem(
        this.PENDING_COUNT_KEY,
        JSON.stringify({ uid: this.uid, count: next })
      );
    } catch (e) {
      /* ignore */
    }
    this.updateSyncStatusUi();
  },

  _clearUnsynced() {
    try {
      localStorage.removeItem(this.PENDING_COUNT_KEY);
    } catch (e) {
      /* ignore */
    }
    this._setPending(false);
    this.updateSyncStatusUi();
  },

  /** ヘッダー等の未送信件数表示を更新する */
  updateSyncStatusUi() {
    if (typeof document === "undefined") return;
    const apply = () => {
      const el = document.getElementById("sync-pending-status");
      if (!el) return;
      const n = this.getUnsyncedCount();
      const show = this.mode === "cloud" && !!this.uid && n > 0;
      el.classList.toggle("hidden", !show);
      if (show) {
        const net =
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "オフラインのため保留中。復帰後に自動送信します。"
            : "送信中または再送待ちです。";
        el.textContent = `未送信の成績: ${n}問 · ${net}`;
      }
    };
    if (this._syncUiTimer) clearTimeout(this._syncUiTimer);
    this._syncUiTimer = setTimeout(apply, 200);
  },

  _listLocalGradeKeys() {
    const keys = new Set();
    if (this.KEY) keys.add(this.KEY);
    const known = [
      "biz_dojo_sap_stats_v1",
      "biz_dojo_biz_career_stats_v1",
      "biz_dojo_windows_shortcuts_stats_v1",
      "biz_dojo_stats_v1",
    ];
    known.forEach((k) => keys.add(k));
    if (typeof SUBJECT_REGISTRY !== "undefined") {
      for (const s of SUBJECT_REGISTRY) {
        if (!s || !s.id) continue;
        keys.add(`biz_dojo_${s.id}_stats_v1`);
      }
    }
    return keys;
  },

  /**
   * ログアウト前: 未送信があれば送る。失敗時は確認。
   * @returns {Promise<boolean>} false ならログアウト中止
   */
  async prepareLogout() {
    if (this.mode !== "cloud" || !this.uid) return true;

    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      try {
        await this._cloudSaveAsync();
        await this.flushPendingCloudSave();
      } catch (e) {
        console.warn("ログアウト前の成績送信に失敗:", e);
      }
    }

    const n = this.getUnsyncedCount();
    const pending = this._isPendingFor(this.uid) || n > 0;
    if (!pending) return true;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return confirm(
        `未送信の成績が${n > 0 ? n + "問分" : ""}あります。オフラインのため送信できません。` +
          "ログアウトするとこの端末の成績表示はクリアされます（クラウドに保存済みの分は残ります）。ログアウトしますか？"
      );
    }
    return confirm(
      `成績の送信が完了していない可能性があります（未送信 ${n}問）。` +
        "ログアウトするとこの端末の成績表示はクリアされます。ログアウトしますか？"
    );
  },

  /** ログアウト後: 端末の成績・サマリを消し、未ログインへ引き継がない */
  clearLocalGradesAfterLogout() {
    for (const key of this._listLocalGradeKeys()) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    }
    if (typeof SubjectSummary !== "undefined" && SubjectSummary.clearAllLocal) {
      SubjectSummary.clearAllLocal();
    } else {
      try {
        localStorage.removeItem("biz_dojo_subject_summary_v1");
      } catch (e) {
        /* ignore */
      }
    }
    try {
      localStorage.removeItem(this.PENDING_KEY);
      localStorage.removeItem(this.PENDING_COUNT_KEY);
    } catch (e) {
      /* ignore */
    }
    this._allSummariesCache = null;
    this.mode = "local";
    this.uid = null;
    this.db = null;
    this.stats = this._empty();
    this.updateSyncStatusUi();
  },

  load() {
    return this.stats;
  },

  /** 1問分の結果を記録する。isInput=true なら記述式（Tコード入力）としても集計する */
  record(questionId, isCorrect, isInput) {
    const s = this.stats;
    const qsBefore = s.q[questionId] ? { ...s.q[questionId] } : null;
    const wasChoiceMastered = qsBefore ? this.isChoiceMastered(qsBefore) : false;
    const wasInputMastered = qsBefore ? (qsBefore.ik || 0) >= 2 : false;

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

    const nowChoiceMastered = this.isChoiceMastered(qs);
    const nowInputMastered = (qs.ik || 0) >= 2;
    this._bumpMasteredCounts(
      wasChoiceMastered,
      nowChoiceMastered,
      wasInputMastered,
      nowInputMastered
    );
    this._syncRankSnapshot();
    this._touchLocalSummaryCache();

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

  /**
   * 現存問題に合わせて成績を再集計（科目読込後に1回）。
   * 削除・変更された問題 ID を q から除き、累計回答・正解・習得もその集計に更新する。
   * （サマリの「max」も現存問題ベースに合わせる）
   */
  reconcileForSubject(choiceValidIds, inputValidIds) {
    const s = this.stats;
    const choiceIds =
      choiceValidIds && choiceValidIds.size ? choiceValidIds : null;
    const inputIds =
      inputValidIds && inputValidIds.size ? inputValidIds : null;

    const before = {
      answered: Number(s.answered) || 0,
      correct: Number(s.correct) || 0,
      inputAnswered: Number(s.inputAnswered) || 0,
      inputCorrect: Number(s.inputCorrect) || 0,
      masteredChoice: Number(s.masteredChoice) || 0,
      masteredInput: Number(s.masteredInput) || 0,
      qSize: this._qMapSize(s.q),
    };

    const rawQ = s.q || {};
    let prunedQ = rawQ;
    let foreignDropped = 0;
    if (choiceIds && before.qSize > 0) {
      prunedQ = {};
      for (const [id, row] of Object.entries(rawQ)) {
        if (choiceIds.has(id)) prunedQ[id] = row;
        else foreignDropped += 1;
      }
      // ほぼ全部消える＝問題マスタ未整備／ID不一致の可能性。潰さない
      if (
        before.qSize >= 20 &&
        this._qMapSize(prunedQ) < Math.max(5, Math.floor(before.qSize * 0.2))
      ) {
        console.warn("成績 reconcile: 問題ID一致が少なすぎるため q の刈り込みをスキップ", {
          subjectId: this.subjectId,
          beforeQ: before.qSize,
          kept: this._qMapSize(prunedQ),
        });
        prunedQ = rawQ;
        foreignDropped = 0;
      }
    }

    const fromQ = this._countersFromQ(prunedQ, inputIds);
    const mcFromQ = this._countChoiceMasteredFromQ(prunedQ, null);
    const miFromQ = this._countInputMasteredFromQ(prunedQ, inputIds);
    const kept = this._qMapSize(prunedQ);

    // 他科目へ SAP サマリがコピーされた汚染だけ除去（SAP 本体は触らない）
    let forceZero = false;
    if (this._looksLikeSapPollution(this.subjectId, before)) {
      forceZero = true;
    } else if (
      this.subjectId &&
      this.subjectId !== "sap" &&
      before.answered > 0 &&
      kept === 0 &&
      foreignDropped === 0
    ) {
      const sapFull = this._loadFromKey("biz_dojo_sap_stats_v1");
      if (
        (Number(sapFull.answered) || 0) > 50 &&
        this._summaryCounterFingerprint(before) === this._summaryCounterFingerprint(sapFull)
      ) {
        forceZero = true;
      }
    }

    /** 現存問題の q 集計でサマリを更新してよいか */
    const trustPrunedQ =
      !forceZero &&
      choiceIds &&
      kept >= 20 &&
      fromQ.answered > 0 &&
      // 刈り込み後も十分残っている、または削除IDを実際に落とした
      (foreignDropped > 0 || Math.abs(fromQ.answered - before.answered) <= Math.max(50, before.answered * 0.35));

    this._pendingReconcileToQ = false;
    this._pendingScrubConfirmed = false;

    if (forceZero) {
      s.answered = 0;
      s.correct = 0;
      s.inputAnswered = 0;
      s.inputCorrect = 0;
      s.masteredChoice = 0;
      s.masteredInput = 0;
      s.q = {};
      this._pendingReconcileToQ = true;
      this._pendingScrubConfirmed = true;
    } else if (trustPrunedQ) {
      s.q = prunedQ;
      s.answered = fromQ.answered;
      s.correct = fromQ.correct;
      s.inputAnswered = fromQ.inputAnswered;
      s.inputCorrect = fromQ.inputCorrect;
      s.masteredChoice = mcFromQ;
      s.masteredInput = miFromQ;
      this._pendingReconcileToQ = foreignDropped > 0 || before.answered !== fromQ.answered;
      if (foreignDropped > 0 || before.answered !== s.answered) {
        console.info("成績 reconcile: 現存問題のみに累計を更新", {
          subjectId: this.subjectId,
          dropped: foreignDropped,
          beforeAnswered: before.answered,
          afterAnswered: s.answered,
          kept,
        });
      }
    } else if (this._countersInflatedVsQ(before, fromQ)) {
      // サマリが q 集計の数倍以上に膨らんでいる → Math.max せず q へ強制
      s.q = prunedQ;
      s.answered = fromQ.answered;
      s.correct = fromQ.correct;
      s.inputAnswered = fromQ.inputAnswered;
      s.inputCorrect = fromQ.inputCorrect;
      s.masteredChoice = mcFromQ;
      s.masteredInput = miFromQ;
      this._pendingReconcileToQ = true;
      this._pendingScrubConfirmed = true;
      console.info("成績 reconcile: 膨らみサマリを q へ強制", {
        subjectId: this.subjectId,
        beforeAnswered: before.answered,
        fromQAnswered: fromQ.answered,
        kept,
      });
    } else {
      s.q = prunedQ;
      s.answered = Math.max(before.answered, fromQ.answered);
      s.correct = Math.max(before.correct, fromQ.correct);
      s.inputAnswered = Math.max(before.inputAnswered, fromQ.inputAnswered);
      s.inputCorrect = Math.max(before.inputCorrect, fromQ.inputCorrect);
      s.masteredChoice = Math.max(before.masteredChoice, mcFromQ);
      s.masteredInput = Math.max(before.masteredInput, miFromQ);
    }

    const changed =
      before.answered !== s.answered ||
      before.correct !== s.correct ||
      before.inputAnswered !== s.inputAnswered ||
      before.inputCorrect !== s.inputCorrect ||
      before.masteredChoice !== s.masteredChoice ||
      before.masteredInput !== s.masteredInput ||
      before.qSize !== this._qMapSize(s.q);

    if (changed) {
      this._syncRankSnapshot(
        typeof createRankContextFromLoaded === "function" ? createRankContextFromLoaded() : null
      );
      this._writeLocal();
      this._touchLocalSummaryCache();
      this.invalidateStatsSummariesCache();
    }
    return changed;
  },

  _countersFromQ(q, inputIds) {
    let answered = 0;
    let correct = 0;
    let inputAnswered = 0;
    let inputCorrect = 0;
    for (const [id, row] of Object.entries(q || {})) {
      answered += Number(row.a) || 0;
      correct += Number(row.c) || 0;
      if (!inputIds || inputIds.has(id)) {
        inputAnswered += Number(row.ia) || 0;
        inputCorrect += Number(row.ic) || 0;
      }
    }
    return { answered, correct, inputAnswered, inputCorrect };
  },

  syncMasteredCounts(choiceValidIds, inputValidIds) {
    return this.reconcileForSubject(choiceValidIds, inputValidIds);
  },

  persistIfDirty() {
    const reconcileOpts = this._pendingReconcileToQ
      ? {
          preferIncomingCounters: true,
          replaceDetailQ: true,
          ...(this._pendingScrubConfirmed ? { scrubConfirmed: true } : {}),
        }
      : {};
    this._pendingReconcileToQ = false;
    this._pendingScrubConfirmed = false;
    if (this.mode === "cloud") return this._cloudSaveAsync(reconcileOpts);
    this._writeLocal();
    return Promise.resolve(true);
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
        this.stats = this._loadLocalForSubject();
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
        const raw = doc.data();
        const needsMasteredBackfill =
          typeof raw.masteredChoice !== "number" && (Number(raw.answered) || 0) > 0;
        const local = this._loadLocalForSubject();
        const cloud = await this._fetchCloudStats(this.uid, this.db, this.subjectId, local);
        const primary = local.answered > cloud.answered ? local : cloud;
        const secondary = primary === local ? cloud : local;
        this.stats = this._mergeStatsPair(primary, secondary);
        if (local.answered > cloud.answered) {
          this._setPending(true);
          await this._cloudSaveAsync();
        } else {
          this._writeLocal();
          this._setPending(false);
          if (
            needsMasteredBackfill ||
            this._statsNeedCloudPush(this.stats, raw, local)
          ) {
            await this._cloudSaveAsync();
          }
        }
        await this._syncRankSnapshot(
          typeof createRankContextFromLoaded === "function" ? createRankContextFromLoaded() : null
        );
        this._touchLocalSummaryCache();
      } else {
        const local = this._loadLocalForSubject();
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

  /** ログアウト時に呼ばれる。端末成績は clearLocalGradesAfterLogout で消す */
  switchToLocal() {
    this.clearLocalGradesAfterLogout();
  },

  /** 未同期のクラウド保存があれば再送する（online イベント／手動呼び出し用） */
  async flushPendingCloudSave() {
    if (this.mode !== "cloud" || !this.uid || !this.db) return false;
    if (!this._isPendingFor(this.uid) && this.getUnsyncedCount() <= 0) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.updateSyncStatusUi();
      return false;
    }
    const ok = await this._cloudSaveAsync();
    if (ok) this._clearUnsynced();
    else this.updateSyncStatusUi();
    return ok;
  },

  /**
   * 科目選択画面用：現在の科目を切り替えずに成績だけ読む（local + ログイン時は Firestore）
   * options.light=true ならサマリのみ（巨大な q / log を読まない）
   */
  async loadStatsForSubject(subjectId, storageKey, options = {}) {
    if (options.light) {
      const summary = await this.loadSubjectSummary(subjectId, storageKey);
      return this._statsFromSummary(summary);
    }

    const key = storageKey || (subjectId ? `biz_dojo_${subjectId}_stats_v1` : this.KEY);
    const local = this._loadLocalCandidatesForSubject(subjectId, key);
    const user =
      typeof firebase !== "undefined" &&
      firebase.auth &&
      firebase.auth().currentUser;
    if (!user || !subjectId) return local;
    const db = this.db || (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore());
    if (!db) return local;
    try {
      return await this._fetchCloudStats(user.uid, db, subjectId, local);
    } catch (e) {
      console.warn("科目成績のクラウド読込に失敗:", subjectId, e);
    }
    return local;
  },

  /** 全科目のサマリ（subjects/{id} のみ・軽量） */
  async loadAllSubjectSummaries() {
    return this.loadAllStatsSummaries();
  },

  async loadAllStatsSummaries() {
    if (this._allSummariesCache) return this._allSummariesCache;

    const merged = {};
    const localDailyById = {};
    const localFullById = {};
    if (typeof SUBJECT_REGISTRY !== "undefined") {
      // subject.js を直列 fetch しない（既知 storageKey で localStorage のみ読む）
      for (const meta of SUBJECT_REGISTRY.filter((s) => s.enabled)) {
        try {
          const key = this._knownSubjectStorageKey(meta.id);
          if (!key) continue;
          const full = this._loadFromKey(key);
          localFullById[meta.id] = full;
          localDailyById[meta.id] = full.daily || {};
          if ((Number(full.answered) || 0) > 0 || this._dailyAheadOfCloud(full, null)) {
            merged[meta.id] = this._summaryFromStats(full);
          }
        } catch (e) {
          /* ignore */
        }
      }
    }

    const user =
      typeof firebase !== "undefined" &&
      firebase.auth &&
      firebase.auth().currentUser;
    this._ensureCloudAuth();
    const db = user && this.db;

    if (user && db) {
      // 先にクラウド／ローカルの科目間コピー汚染を修復
      await this.repairPollutedNonSapSubjects();
      const subjects = (typeof SUBJECT_REGISTRY !== "undefined" ? SUBJECT_REGISTRY : []).filter(
        (s) => s.enabled
      );
      const snaps = await Promise.all(
        subjects.map((s) =>
          db.collection("users").doc(user.uid).collection("subjects").doc(s.id).get()
        )
      );
      for (let i = 0; i < subjects.length; i++) {
        const doc = snaps[i];
        if (!doc.exists) continue;
        const id = subjects[i].id;
        const peersForCheck = { ...merged };
        let cloud = this._summaryFromDoc(doc.data());
        if (this._looksLikeCrossSubjectPollution(id, cloud, peersForCheck)) {
          cloud =
            typeof SubjectSummary !== "undefined"
              ? SubjectSummary.empty()
              : this._summaryFromStats(this._empty());
        }
        let local = merged[id];
        if (local && this._looksLikeCrossSubjectPollution(id, local, peersForCheck)) {
          local = null;
          delete merged[id];
        }
        const combined = local
          ? this._mergeSummaryRecords(local, cloud, id, peersForCheck)
          : cloud;
        combined.daily = this._pickSubjectDaily(
          localDailyById[id],
          cloud.daily,
          local && local.daily,
          combined.answered
        );
        merged[id] = combined;
      }
    }

    this._sanitizeCrossSubjectPollution(merged, localFullById);

    if (typeof SUBJECT_REGISTRY !== "undefined") {
      for (const meta of SUBJECT_REGISTRY.filter((s) => s.enabled)) {
        const id = meta.id;
        if (!merged[id]) {
          const full = localFullById[id];
          if (full && ((Number(full.answered) || 0) > 0 || this._dailyAheadOfCloud(full, null))) {
            merged[id] = this._summaryFromStats(full);
          }
        }
        if (merged[id]) {
          merged[id] = this._displaySummary(merged[id]);
          // 表示上も未プレイならマップから外し、カード側は empty 扱い
          if (
            (Number(merged[id].answered) || 0) === 0 &&
            (Number(merged[id].masteredChoice) || 0) === 0
          ) {
            const daily = merged[id].daily || {};
            if (!daily || Object.keys(daily).length === 0) {
              delete merged[id];
            }
          }
        }
        if (typeof SubjectSummary !== "undefined") {
          SubjectSummary.setLocal(id, merged[id] || SubjectSummary.empty());
        }
      }
    }

    this._allSummariesCache = merged;
    return merged;
  },

  async loadSubjectSummary(subjectId, storageKey) {
    const all = await this.loadAllStatsSummaries();
    if (all && all[subjectId]) return all[subjectId];
    if (storageKey) {
      const full = this._loadFromKey(storageKey);
      if ((Number(full.answered) || 0) > 0) return this._summaryFromStats(full);
    }
    if (typeof SubjectSummary !== "undefined") {
      return SubjectSummary.getLocal(subjectId);
    }
    return { answered: 0, correct: 0, masteredChoice: 0, daily: {} };
  },

  async loadStatsSummary(subjectId, storageKey) {
    return this.loadSubjectSummary(subjectId, storageKey);
  },

  invalidateStatsSummariesCache() {
    this._allSummariesCache = null;
  },

  /**
   * 全科目を走査し、端末ローカルがクラウドより進んでいれば同期する。
   * マイページ表示前に呼ぶと、他端末へ日別成績が届きやすくなる。
   */
  async syncAllSubjectsToCloudIfNeeded() {
    if (!this._ensureCloudAuth()) return false;
    await this.repairPollutedNonSapSubjects();
    const user = firebase.auth().currentUser;
    const db = this.db;
    const subjects = (typeof SUBJECT_REGISTRY !== "undefined" ? SUBJECT_REGISTRY : []).filter(
      (s) => s.enabled
    );
    let pushed = false;
    for (const meta of subjects) {
      try {
        const storageKey = this._knownSubjectStorageKey(meta.id);
        if (!storageKey) continue;
        let local = this._loadLocalCandidatesForSubject(meta.id, storageKey);
        local = this._scrubPollutedStats(meta.id, local);
        if (this._looksLikeSapPollution(meta.id, local)) continue;
        if (!(Number(local.answered) || 0) && !this._dailyAheadOfCloud(local, null)) continue;

        const ref = db.collection("users").doc(user.uid).collection("subjects").doc(meta.id);
        const mainSnap = await ref.get();
        const mainData = mainSnap.exists ? mainSnap.data() : null;
        // クラウドが汚染なら修復して push しない（repair 済み想定）
        if (mainData && this._looksLikeSapPollution(meta.id, mainData)) continue;
        if (!this._statsNeedCloudPush(local, mainData, local)) continue;

        const fullLocal = this._scrubPollutedStats(meta.id, this._loadFromKey(storageKey));
        if (this._looksLikeSapPollution(meta.id, fullLocal)) continue;
        const toSave =
          this._qMapSize(fullLocal.q) > 0
            ? this._mergeStatsPair(fullLocal, local)
            : this._mergeStatsPair(local, this._statsFromSummary(mainData || {}));
        if (this._looksLikeSapPollution(meta.id, toSave)) continue;
        const ok = await this._cloudSaveAsyncForSubject(meta.id, toSave);
        if (ok) pushed = true;
        else console.warn("科目クラウド同期の保存に失敗:", meta.id);
      } catch (e) {
        console.warn("科目クラウド同期に失敗:", meta.id, e);
      }
    }
    if (pushed) this.invalidateStatsSummariesCache();
    return pushed;
  },

  /** ログイン済みなのに uid/db が未設定のときに補完する */
  _ensureCloudAuth() {
    const user =
      typeof firebase !== "undefined" &&
      firebase.auth &&
      firebase.auth().currentUser;
    if (!user) return false;
    if (!this.db) this.db = this._getFirestoreDb();
    if (!this.uid) this.uid = user.uid;
    if (this.uid === user.uid) this.mode = "cloud";
    return !!(this.db && this.uid);
  },

  async _getServerSnapshot(ref) {
    // 既定はキャッシュ可。必要時のみ呼び出し側で source:server を指定する
    return await ref.get();
  },

  _legacyStorageKeyForSubject(subjectId) {
    if (typeof LegacyStatsImport !== "undefined" && LegacyStatsImport.LOCAL_MAPPINGS) {
      const mapping = LegacyStatsImport.LOCAL_MAPPINGS.find((m) => m.subjectId === subjectId);
      if (mapping) return mapping.fromKey;
    }
    const fallbacks = {
      sap: "sap_tcode_dojo_stats_v1",
      "biz-career": "study_dojo_biz_career_stats_v1",
      "windows-shortcuts": "study_dojo_windows_shortcuts_stats_v1",
      "ai-ontology-intro": "study_dojo_ai_ontology_intro_stats_v1",
      "ai-ontology-core": "study_dojo_ai_ontology_core_stats_v1",
    };
    return fallbacks[subjectId] || null;
  },

  /**
   * 表示用サマリ。回答・習得が無いのに段位だけ残っている幽霊進捗を落とす。
   * （SAP混入修復後やクラウド残渣で「未プレイなのに段位」になるのを防ぐ）
   */
  _displaySummary(summary) {
    const s =
      typeof SubjectSummary !== "undefined"
        ? SubjectSummary.normalize(summary)
        : this._summaryFromStats(summary || {});
    const answered = Number(s.answered) || 0;
    const mastered = Number(s.masteredChoice) || 0;
    if (answered > 0 || mastered > 0) return s;
    const daily = s.daily || {};
    if (typeof SubjectSummary !== "undefined") {
      return { ...SubjectSummary.empty(), daily };
    }
    return {
      answered: 0,
      correct: 0,
      inputAnswered: 0,
      inputCorrect: 0,
      masteredChoice: 0,
      masteredInput: 0,
      rankName: "",
      rankAlias: "",
      rankColor: "",
      rankFg: "",
      choiceAccPct: 0,
      daily,
    };
  },

  /** 累計・習得の比較用（他科目汚染の検出） */
  _summaryCounterFingerprint(summary) {
    const s =
      typeof SubjectSummary !== "undefined"
        ? SubjectSummary.normalize(summary)
        : summary || {};
    return [
      Number(s.answered) || 0,
      Number(s.correct) || 0,
      Number(s.masteredChoice) || 0,
    ].join("|");
  },

  /** 既知の科目本体キー（レジストリに storageKey が無いとき用） */
  _knownSubjectStorageKey(subjectId) {
    const known = {
      sap: "biz_dojo_sap_stats_v1",
      "biz-career": "biz_dojo_biz_career_stats_v1",
      "windows-shortcuts": "biz_dojo_windows_shortcuts_stats_v1",
      "excel-functions": "biz_dojo_excel_functions_stats_v1",
      "outlook-mail": "biz_dojo_outlook_mail_stats_v1",
      "teams-collab": "biz_dojo_teams_collab_stats_v1",
      "ai-ontology-intro": "biz_dojo_ai_ontology_intro_stats_v1",
      "ai-ontology-core": "biz_dojo_ai_ontology_core_stats_v1",
    };
    if (known[subjectId]) return known[subjectId];
    if (!subjectId) return "";
    return `biz_dojo_${String(subjectId).replace(/-/g, "_")}_stats_v1`;
  },

  /** 記述式カテゴリがある科目（現状 SAP のみ。subject.js fetch 回避用） */
  _subjectAllowsInput(subjectId) {
    if (
      typeof CURRENT_SUBJECT !== "undefined" &&
      CURRENT_SUBJECT &&
      CURRENT_SUBJECT.id === subjectId &&
      Array.isArray(CURRENT_SUBJECT.inputCategories)
    ) {
      return CURRENT_SUBJECT.inputCategories.length > 0;
    }
    return subjectId === "sap";
  },

  /**
   * 他科目サマリのスナップショットを集める（汚染ペア判定用）。
   * peersById があれば優先し、なければ SubjectSummary / 本体キーから読む。
   */
  _collectPeerSummaries(excludeId, peersById) {
    const out = {};
    const ids = new Set();
    if (peersById && typeof peersById === "object") {
      Object.keys(peersById).forEach((id) => ids.add(id));
    }
    if (typeof SUBJECT_REGISTRY !== "undefined") {
      SUBJECT_REGISTRY.filter((s) => s.enabled).forEach((s) => ids.add(s.id));
    }
    if (typeof SubjectSummary !== "undefined") {
      Object.keys(SubjectSummary.readLocalMap() || {}).forEach((id) => ids.add(id));
    }
    for (const id of ids) {
      if (!id || id === excludeId) continue;
      if (peersById && peersById[id]) {
        out[id] =
          typeof SubjectSummary !== "undefined"
            ? SubjectSummary.normalize(peersById[id])
            : this._summaryFromStats(peersById[id]);
        continue;
      }
      let snap = null;
      if (typeof SubjectSummary !== "undefined") {
        const cached = SubjectSummary.getLocal(id);
        if ((Number(cached.answered) || 0) > 0 || (Number(cached.masteredChoice) || 0) > 0) {
          snap = cached;
        }
      }
      if (!snap) {
        const key = this._knownSubjectStorageKey(id);
        const full = key ? this._loadFromKey(key) : null;
        if (full && ((Number(full.answered) || 0) > 0 || (Number(full.masteredChoice) || 0) > 0)) {
          snap = this._summaryFromStats(full);
        }
      }
      if (snap) out[id] = snap;
    }
    return out;
  },

  /** 規模が大きい方をソースとみなす（同規模なら sap 優先、それ以外は id 昇順） */
  _preferPollutionSourceId(idA, sumA, idB, sumB) {
    const aAns = Number(sumA && sumA.answered) || 0;
    const bAns = Number(sumB && sumB.answered) || 0;
    if (aAns !== bAns) return aAns > bAns ? idA : idB;
    if (idA === "sap") return idA;
    if (idB === "sap") return idB;
    return idA < idB ? idA : idB;
  },

  /** サマリ指紋の完全一致（0|0|0 は対象外） */
  _isExactCounterFingerprintMatch(a, b) {
    const fa = this._summaryCounterFingerprint(a);
    const fb = this._summaryCounterFingerprint(b);
    return !!(fa && fb && fa !== "0|0|0" && fa === fb);
  },

  /**
   * 近傍一致（旧コピーのずれ拾い）。
   * 両側 answered>=500 かつ answered/correct がともに ±20% 以内。
   * masteredChoice が大きいときはそれも近傍であることを要求（健全科目の誤検知抑制）。
   */
  _isNearCounterFingerprintMatch(a, b) {
    const aAns = Number(a && a.answered) || 0;
    const bAns = Number(b && b.answered) || 0;
    const aCor = Number(a && a.correct) || 0;
    const bCor = Number(b && b.correct) || 0;
    if (aAns < 500 || bAns < 500) return false;
    const ansRatio = Math.abs(aAns - bAns) / Math.max(aAns, bAns);
    const corDenom = Math.max(aCor, bCor);
    const corRatio = corDenom > 0 ? Math.abs(aCor - bCor) / corDenom : 1;
    if (ansRatio > 0.2 || corRatio > 0.2) return false;
    const aMc = Number(a && a.masteredChoice) || 0;
    const bMc = Number(b && b.masteredChoice) || 0;
    if (Math.max(aMc, bMc) >= 50) {
      const mcRatio = Math.abs(aMc - bMc) / Math.max(aMc, bMc);
      if (mcRatio > 0.25) return false;
    }
    return true;
  },

  /**
   * candidate が source のコピー汚染か。
   * - 完全一致: candidate.answered >= 100
   * - 近傍: candidate.answered >= 500
   * - 小さい側でも数百超で一致ならコピー疑い（完全一致パスでカバー）
   * - 規模が大きい方をソース、小さい側を汚染
   */
  _pairIndicatesCopyPollution(candidateId, candidate, sourceId, source) {
    if (!candidateId || !sourceId || candidateId === sourceId || !candidate || !source) {
      return false;
    }
    if (this._preferPollutionSourceId(candidateId, candidate, sourceId, source) !== sourceId) {
      return false;
    }
    const candAns = Number(candidate.answered) || 0;
    if (candAns >= 100 && this._isExactCounterFingerprintMatch(candidate, source)) {
      return true;
    }
    if (candAns >= 500 && this._isNearCounterFingerprintMatch(candidate, source)) {
      return true;
    }
    return false;
  },

  /**
   * 記述式（Tコード入力）を使う科目か。
   * 現状は SAP のみ。CURRENT_SUBJECT が一致すれば inputCategories を優先。
   */
  _subjectAllowsInput(subjectId) {
    if (!subjectId) return false;
    if (
      typeof CURRENT_SUBJECT !== "undefined" &&
      CURRENT_SUBJECT &&
      CURRENT_SUBJECT.id === subjectId
    ) {
      return (
        Array.isArray(CURRENT_SUBJECT.inputCategories) &&
        CURRENT_SUBJECT.inputCategories.length > 0
      );
    }
    return subjectId === "sap";
  },

  /**
   * サマリ answered が q 集計の数倍以上に膨らんでいるか。
   * （例: 2倍超かつ差50以上 → Math.max せず q へ強制 reconcile）
   */
  _countersInflatedVsQ(summary, fromQ) {
    const answered = Number(summary && summary.answered) || 0;
    const qAnswered = Number(fromQ && fromQ.answered) || 0;
    if (qAnswered <= 0) return false;
    return answered > qAnswered * 2 && answered - qAnswered >= 50;
  },

  /**
   * 他科目の累計指紋コピー／記述式カウンタ混入か。
   * 1) 非記述式科目なのに inputAnswered/masteredInput > 0
   * 2) 任意の他科目と指紋完全一致（answered>=100、規模が小さい側）
   * 3) 任意の他科目と近傍一致（answered>=500）
   * peersById があればそれを優先（全科目サマリ一括時）。
   */
  _looksLikeCrossSubjectPollution(subjectId, stats, peersById) {
    if (!subjectId || !stats) return false;

    if (!this._subjectAllowsInput(subjectId)) {
      if (
        (Number(stats.inputAnswered) || 0) > 0 ||
        (Number(stats.masteredInput) || 0) > 0
      ) {
        return true;
      }
    }

    const answered = Number(stats.answered) || 0;
    if (answered < 100) return false;

    const peers = this._collectPeerSummaries(subjectId, peersById);
    for (const [peerId, peer] of Object.entries(peers)) {
      if (this._pairIndicatesCopyPollution(subjectId, stats, peerId, peer)) {
        return true;
      }
    }
    return false;
  },

  /** 互換エイリアス（旧 SAP 指紋依存 API） */
  _looksLikeSapPollution(subjectId, stats, peersById) {
    return this._looksLikeCrossSubjectPollution(subjectId, stats, peersById);
  },

  /** 任意ピアとの近傍コピーか（マージ時の端末汚染回避用） */
  _looksLikeNearCloneOfPeers(stats, subjectId, peersById) {
    const answered = Number(stats && stats.answered) || 0;
    if (answered < 500 || !subjectId) return false;
    const peers = this._collectPeerSummaries(subjectId, peersById);
    for (const [peerId, peer] of Object.entries(peers)) {
      if (!this._isNearCounterFingerprintMatch(stats, peer)) continue;
      if (this._preferPollutionSourceId(subjectId, stats, peerId, peer) === peerId) {
        return true;
      }
    }
    return false;
  },

  /** 互換エイリアス */
  _looksLikeNearSapClone(stats, subjectId, peersById) {
    return this._looksLikeNearCloneOfPeers(stats, subjectId || "sap", peersById);
  },

  /** 汚染成績を空の成績に戻す */
  _scrubPollutedStats(subjectId, stats, peersById) {
    const base = this._normalize(stats || this._empty());
    if (!this._looksLikeCrossSubjectPollution(subjectId, base, peersById)) return base;
    console.warn("科目間成績コピーの混入を除去:", subjectId, {
      answered: base.answered,
      correct: base.correct,
      masteredChoice: base.masteredChoice,
    });
    return this._empty();
  },

  /**
   * 汚染された科目をローカル＋クラウドから修復する（表示前）。
   * ソース側（規模が大きい／同規模の優先科目）は触らず、汚染側だけ直す。
   */
  async repairPollutedNonSapSubjects() {
    if (typeof SUBJECT_REGISTRY === "undefined") return false;

    let repaired = false;
    const subjects = SUBJECT_REGISTRY.filter((s) => s.enabled);
    const peerMap = {};
    for (const meta of subjects) {
      const key = this._knownSubjectStorageKey(meta.id);
      if (!key) continue;
      peerMap[meta.id] = this._summaryFromStats(this._loadFromKey(key));
    }

    // クラウド取得は並列（科目増でも待ちを伸ばさない）
    const cloudById = {};
    if (this._ensureCloudAuth()) {
      try {
        const snaps = await Promise.all(
          subjects.map((s) =>
            this.db.collection("users").doc(this.uid).collection("subjects").doc(s.id).get()
          )
        );
        for (let i = 0; i < subjects.length; i++) {
          if (snaps[i] && snaps[i].exists) cloudById[subjects[i].id] = snaps[i].data();
        }
      } catch (e) {
        console.warn("汚染修復用クラウド読込に失敗:", e);
      }
    }

    for (const meta of subjects) {
      try {
        const storageKey = this._knownSubjectStorageKey(meta.id);
        if (!storageKey) continue;
        const allowsInput = this._subjectAllowsInput(meta.id);

        const local = this._loadFromKey(storageKey);
        const localPolluted = this._isPollutedSubjectStats(
          meta.id,
          local,
          allowsInput,
          peerMap
        );
        const cloudData = cloudById[meta.id] || null;
        const cloudPolluted = cloudData
          ? this._isPollutedSubjectStats(meta.id, cloudData, allowsInput, peerMap)
          : false;

        if (!localPolluted && !cloudPolluted) continue;

        // クラウドが健全なら端末だけ捨ててクラウドを採用（空で上書きして detail を壊さない）
        if (localPolluted && !cloudPolluted && cloudData) {
          const adopted = this._statsFromSummary(cloudData);
          try {
            localStorage.setItem(storageKey, JSON.stringify(adopted));
          } catch (e) {
            /* ignore */
          }
          if (typeof SubjectSummary !== "undefined") {
            SubjectSummary.setLocal(meta.id, this._summaryFromStats(adopted));
          }
          peerMap[meta.id] = this._summaryFromStats(adopted);
          repaired = true;
          console.info("科目成績の端末汚染を除去（クラウド採用）:", meta.id, {
            answered: adopted.answered,
            correct: adopted.correct,
          });
          continue;
        }

        const clean = this._empty();
        try {
          localStorage.setItem(storageKey, JSON.stringify(clean));
        } catch (e) {
          /* ignore */
        }
        if (typeof SubjectSummary !== "undefined") {
          SubjectSummary.setLocal(meta.id, this._summaryFromStats(clean));
        }
        peerMap[meta.id] = this._summaryFromStats(clean);
        if (cloudPolluted) {
          // サマリだけ空に戻す。detail/q は消さない
          await this._cloudSaveAsyncForSubject(meta.id, clean, {
            preferIncomingCounters: true,
            replaceDetailQ: false,
            skipLocalWrite: true,
            scrubConfirmed: true,
          });
        }
        repaired = true;
        console.info("科目成績の科目間コピー汚染を修復:", meta.id);
      } catch (e) {
        console.warn("科目汚染修復に失敗:", meta.id, e);
      }
    }
    if (repaired) this.invalidateStatsSummariesCache();
    return repaired;
  },

  /**
   * repair 用: subject.js から得た記述式有無を明示して汚染判定する。
   * allowsInput=true の科目は input カウンタでは汚染とみなさない。
   */
  _isPollutedSubjectStats(subjectId, stats, allowsInput, peersById) {
    if (!subjectId || !stats) return false;
    if (!allowsInput) {
      if (
        (Number(stats.inputAnswered) || 0) > 0 ||
        (Number(stats.masteredInput) || 0) > 0
      ) {
        return true;
      }
    }
    return this._looksLikeCrossSubjectPollution(subjectId, stats, peersById);
  },

  /** 互換エイリアス */
  _isPollutedNonSapStats(subjectId, stats, allowsInput, peersById) {
    return this._isPollutedSubjectStats(subjectId, stats, allowsInput, peersById);
  },

  /**
   * 任意2科目間の累計指紋コピー汚染を除去。
   * ソース側は残し、汚染側は本体キーが健全ならそれを採用、さもなくばゼロクリア。
   * Math.max での汚染再注入はしない。
   */
  _sanitizeCrossSubjectPollution(merged, localFullById) {
    if (!merged || typeof merged !== "object") return merged;

    const peerMap = { ...merged };
    if (localFullById) {
      for (const [id, full] of Object.entries(localFullById)) {
        if (!peerMap[id] && full) peerMap[id] = this._summaryFromStats(full);
      }
    }

    for (const id of Object.keys(merged)) {
      const row = merged[id];
      if (!row) continue;
      const polluted = this._looksLikeCrossSubjectPollution(id, row, peerMap);
      if (!polluted) continue;

      const keyFull = localFullById && localFullById[id];
      const keySummary = keyFull ? this._summaryFromStats(keyFull) : null;
      const keyAlsoPolluted =
        !keySummary ||
        (Number(keySummary.answered) || 0) === 0 ||
        this._looksLikeCrossSubjectPollution(id, keySummary, peerMap);

      if (!keyAlsoPolluted && keySummary && (Number(keySummary.answered) || 0) > 0) {
        merged[id] = {
          ...row,
          ...keySummary,
          daily: this._pickSubjectDaily(
            keyFull && keyFull.daily,
            row.daily,
            null,
            keySummary.answered
          ),
        };
        peerMap[id] = merged[id];
      } else if (typeof SubjectSummary !== "undefined") {
        merged[id] = SubjectSummary.normalize({
          answered: 0,
          correct: 0,
          inputAnswered: 0,
          inputCorrect: 0,
          masteredChoice: 0,
          masteredInput: 0,
          choiceAccPct: 0,
          rankName: "",
          rankAlias: "",
          rankColor: "",
          rankFg: "",
          daily: {},
        });
        peerMap[id] = merged[id];
        // 本体キーも汚染なら消す
        if (keyAlsoPolluted && keyFull && localFullById) {
          try {
            const meta = (typeof SUBJECT_REGISTRY !== "undefined" ? SUBJECT_REGISTRY : []).find(
              (s) => s.id === id
            );
            const key =
              (meta && meta.storageKey) || this._knownSubjectStorageKey(id);
            localStorage.setItem(key, JSON.stringify(this._empty()));
            localFullById[id] = this._empty();
          } catch (e) {
            /* ignore */
          }
        }
      }
    }
    return merged;
  },

  /** 科目のローカル成績を複数ソースから統合（日別がサマリキャッシュだけにあるケース対策） */
  _loadLocalCandidatesForSubject(subjectId, storageKey) {
    const full =
      storageKey
        ? this._loadFromKey(storageKey)
        : this._empty();
    let merged =
      (Number(full.answered) || 0) > 0 || this._dailyAheadOfCloud(full, null)
        ? full
        : this._empty();

    if (typeof SubjectSummary !== "undefined") {
      const summary = SubjectSummary.getLocal(subjectId);
      const summaryDaily = this._normalizeDaily(summary.daily);
      const mergedDaily = this._normalizeDaily(merged.daily);
      // 累計・習得は科目本体キーのみ。サマリキャッシュは日別の欠落時だけ補完
      if (
        Object.keys(mergedDaily).length === 0 &&
        Object.keys(summaryDaily).length > 0 &&
        !this._dailyInconsistentWithAnswered(summaryDaily, merged.answered)
      ) {
        merged.daily = summaryDaily;
      }
    }

    const legacyKey = this._legacyStorageKeyForSubject(subjectId);
    if (legacyKey && legacyKey !== storageKey) {
      const legacy = this._loadFromKey(legacyKey);
      if ((Number(legacy.answered) || 0) > 0 || this._dailyAheadOfCloud(legacy, null)) {
        const keepDaily = this._normalizeDaily(merged.daily);
        merged = this._mergeStatsPair(merged, legacy);
        if (Object.keys(keepDaily).length > 0) merged.daily = keepDaily;
      }
    }

    return (Number(merged.answered) || 0) > 0 || this._dailyAheadOfCloud(merged, null)
      ? merged
      : this._empty();
  },

  /** 科目の日別は本体キー → クラウド → サマリの順。Math.max 混ぜはしない */
  _pickSubjectDaily(storageDaily, cloudDaily, summaryDaily, answered) {
    const ans = Number(answered) || 0;
    const fromKey = this._normalizeDaily(storageDaily);
    const fromCloud = this._normalizeDaily(cloudDaily);
    const fromSummary = this._normalizeDaily(summaryDaily);
    if (Object.keys(fromKey).length > 0 && !this._dailyInconsistentWithAnswered(fromKey, ans)) {
      return fromKey;
    }
    if (Object.keys(fromCloud).length > 0 && !this._dailyInconsistentWithAnswered(fromCloud, ans)) {
      return fromCloud;
    }
    if (Object.keys(fromKey).length > 0) return fromKey;
    if (Object.keys(fromCloud).length > 0) return fromCloud;
    return fromSummary;
  },

  /** 1日の回答が累計を大きく超える＝他科目の日別が混入した可能性 */
  _dailyInconsistentWithAnswered(daily, answered) {
    const ans = Number(answered) || 0;
    const norm = this._normalizeDaily(daily || {});
    for (const v of Object.values(norm)) {
      if ((v.a || 0) > ans + 5) return true;
    }
    return false;
  },

  /** 同期状態の確認用（ブラウザコンソールから QuizStorage.debugSyncStatus("sap")） */
  async debugSyncStatus(subjectId, storageKey) {
    const key = storageKey || (subjectId ? `biz_dojo_${subjectId}_stats_v1` : this.KEY);
    const local = this._loadLocalCandidatesForSubject(subjectId, key);
    const today = this._todayKey();
    const out = {
      subjectId,
      mode: this.mode,
      uid: this.uid || null,
      loggedIn: !!(typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser),
      localToday: (local.daily && local.daily[today] && local.daily[today].a) || 0,
      localAnswered: local.answered || 0,
      cloudToday: 0,
      cloudAnswered: 0,
      pending: this._isPendingFor(this.uid),
    };
    if (!this._ensureCloudAuth() || !subjectId) return out;
    try {
      const ref = this.db.collection("users").doc(this.uid).collection("subjects").doc(subjectId);
      const snap = await this._getServerSnapshot(ref);
      if (snap.exists) {
        const cloud = this._summaryFromDoc(snap.data());
        out.cloudToday = (cloud.daily && cloud.daily[today] && cloud.daily[today].a) || 0;
        out.cloudAnswered = cloud.answered || 0;
      }
    } catch (e) {
      out.error = String(e && e.message ? e.message : e);
    }
    return out;
  },

  invalidateSubjectSummariesCache() {
    this.invalidateStatsSummariesCache();
  },

  _statsFromSummary(summary) {
    const s =
      typeof SubjectSummary !== "undefined"
        ? SubjectSummary.normalize(summary)
        : summary || {};
    return {
      answered: s.answered || 0,
      correct: s.correct || 0,
      inputAnswered: s.inputAnswered || 0,
      inputCorrect: s.inputCorrect || 0,
      masteredChoice: s.masteredChoice || 0,
      masteredInput: s.masteredInput || 0,
      rankName: s.rankName || "",
      rankAlias: s.rankAlias || "",
      rankColor: s.rankColor || "",
      rankFg: s.rankFg || "",
      choiceAccPct: s.choiceAccPct || 0,
      choiceLog: [],
      inputLog: [],
      q: {},
      daily: s.daily || {},
    };
  },

  _summaryFromStats(stats) {
    if (typeof SubjectSummary !== "undefined") {
      return SubjectSummary.fromStats(stats);
    }
    return {
      answered: Number(stats.answered) || 0,
      correct: Number(stats.correct) || 0,
      inputAnswered: Number(stats.inputAnswered) || 0,
      inputCorrect: Number(stats.inputCorrect) || 0,
      masteredChoice: Number(stats.masteredChoice) || 0,
      masteredInput: Number(stats.masteredInput) || 0,
      rankName: stats.rankName || "",
      rankAlias: stats.rankAlias || "",
      rankColor: stats.rankColor || "",
      rankFg: stats.rankFg || "",
      choiceAccPct: Number(stats.choiceAccPct) || 0,
      daily: stats.daily || {},
    };
  },

  _summaryFromDoc(data) {
    if (typeof SubjectSummary !== "undefined") {
      return SubjectSummary.normalize(data);
    }
    return this._summaryFromStats(data || {});
  },

  _syncRankSnapshot(rankCtx) {
    const s = this.stats;
    if (rankCtx && typeof getRankForContext === "function") {
      const rank = getRankForContext(s, rankCtx);
      if (rank) {
        s.rankName = rank.name || "";
        s.rankAlias = rank.alias || "";
        s.rankColor = rank.color || "";
        s.rankFg = rank.fg || "";
      }
    } else if (typeof createRankContextFromLoaded === "function" && typeof QUIZ_DATA !== "undefined") {
      const rank = getRankForContext(s, createRankContextFromLoaded());
      if (rank) {
        s.rankName = rank.name || "";
        s.rankAlias = rank.alias || "";
        s.rankColor = rank.color || "";
        s.rankFg = rank.fg || "";
      }
    }
    if (typeof rankChoiceAccuracyPct === "function") {
      s.choiceAccPct = rankChoiceAccuracyPct(s);
    }
  },

  _touchLocalSummaryCache() {
    if (!this.subjectId) return;
    const summary = this._summaryFromStats(this.stats);
    if (typeof SubjectSummary !== "undefined") {
      SubjectSummary.setLocal(this.subjectId, summary);
    }
    this.invalidateStatsSummariesCache();
  },

  _bumpMasteredCounts(wasChoiceMastered, nowChoiceMastered, wasInputMastered, nowInputMastered) {
    const s = this.stats;
    if (typeof s.masteredChoice !== "number") {
      s.masteredChoice = this._countChoiceMasteredFromQ(s.q);
    } else {
      if (!wasChoiceMastered && nowChoiceMastered) s.masteredChoice += 1;
      if (wasChoiceMastered && !nowChoiceMastered) {
        s.masteredChoice = Math.max(0, s.masteredChoice - 1);
      }
    }
    if (typeof s.masteredInput !== "number") {
      s.masteredInput = this._countInputMasteredFromQ(s.q);
    } else {
      if (!wasInputMastered && nowInputMastered) s.masteredInput += 1;
      if (wasInputMastered && !nowInputMastered) {
        s.masteredInput = Math.max(0, s.masteredInput - 1);
      }
    }
  },

  _countChoiceMasteredFromQ(q, validIds) {
    if (!q) return 0;
    let n = 0;
    for (const [id, s] of Object.entries(q)) {
      if (validIds && !validIds.has(id)) continue;
      if (this.isChoiceMastered(s)) n += 1;
    }
    return n;
  },

  _countInputMasteredFromQ(q, validIds) {
    if (!q) return 0;
    let n = 0;
    for (const [id, s] of Object.entries(q)) {
      if (validIds && !validIds.has(id)) continue;
      if ((s.ik || 0) >= 2) n += 1;
    }
    return n;
  },

  _detailRef(subjectId) {
    const ref = this._subjectRef(subjectId);
    if (!ref) return null;
    return ref.collection("detail").doc(STATS_DETAIL_DOC_ID);
  },

  _mergeCloudDocuments(mainData, detailData) {
    const main = mainData || {};
    const detail = detailData || {};
    const merged = Object.assign({}, main);
    // 空の {} / [] は truthy なので、厚い方を採用する（空 detail で本体を潰さない）
    const mainQ = this._qMapSize(main.q);
    const detailQ = this._qMapSize(detail.q);
    if (detailQ > 0 && detailQ >= mainQ) merged.q = detail.q;
    else if (mainQ > 0) merged.q = main.q;
    else if (detail.q) merged.q = detail.q;

    const mainChoice = Array.isArray(main.choiceLog) ? main.choiceLog.length : 0;
    const detailChoice = Array.isArray(detail.choiceLog) ? detail.choiceLog.length : 0;
    if (detailChoice > 0 && detailChoice >= mainChoice) merged.choiceLog = detail.choiceLog;
    else if (mainChoice > 0) merged.choiceLog = main.choiceLog;
    else if (Array.isArray(detail.choiceLog)) merged.choiceLog = detail.choiceLog;

    const mainInput = Array.isArray(main.inputLog) ? main.inputLog.length : 0;
    const detailInput = Array.isArray(detail.inputLog) ? detail.inputLog.length : 0;
    if (detailInput > 0 && detailInput >= mainInput) merged.inputLog = detail.inputLog;
    else if (mainInput > 0) merged.inputLog = main.inputLog;
    else if (Array.isArray(detail.inputLog)) merged.inputLog = detail.inputLog;

    return merged;
  },

  _pickLongerLog(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    return left.length >= right.length ? left.slice() : right.slice();
  },

  _estimateChoiceAttempts(stats) {
    return Math.max(0, (Number(stats && stats.answered) || 0) - (Number(stats && stats.inputAnswered) || 0));
  },

  /** 回答数とログ長の整合が良い方を採用。両方大きく欠けているときは長い方 */
  _pickBetterLog(statsA, statsB, field) {
    const logA = Array.isArray(statsA && statsA[field]) ? statsA[field] : [];
    const logB = Array.isArray(statsB && statsB[field]) ? statsB[field] : [];
    if (logA.length === 0) return logB.slice();
    if (logB.length === 0) return logA.slice();

    const attemptsA =
      field === "inputLog"
        ? Number(statsA.inputAnswered) || 0
        : this._estimateChoiceAttempts(statsA);
    const attemptsB =
      field === "inputLog"
        ? Number(statsB.inputAnswered) || 0
        : this._estimateChoiceAttempts(statsB);
    const gapA = Math.abs(logA.length - attemptsA);
    const gapB = Math.abs(logB.length - attemptsB);
    const incompleteA = attemptsA > 50 && logA.length < attemptsA * 0.5;
    const incompleteB = attemptsB > 50 && logB.length < attemptsB * 0.5;
    // 計測開始前の回答が多く、両方ログが欠けている → 長い方を残す
    if (incompleteA && incompleteB) {
      return logA.length >= logB.length ? logA.slice() : logB.slice();
    }
    if (gapB + 5 < gapA) return logB.slice();
    if (gapA + 5 < gapB) return logA.slice();
    return logA.length >= logB.length ? logA.slice() : logB.slice();
  },

  /** 複数ソースから最長の正誤ログを採用 */
  _pickLongestLogFromStatsList(list, field) {
    let best = [];
    for (const stats of list) {
      const log = Array.isArray(stats && stats[field]) ? stats[field] : [];
      if (log.length > best.length) best = log;
    }
    return best.slice();
  },

  _mergeDailyMaps(a, b) {
    const left = this._normalizeDaily(a || {});
    const right = this._normalizeDaily(b || {});
    const out = { ...left };
    for (const [k, v] of Object.entries(right)) {
      if (!out[k]) out[k] = { a: v.a || 0, c: v.c || 0 };
      else {
        out[k] = {
          a: Math.max(out[k].a || 0, v.a || 0),
          c: Math.max(out[k].c || 0, v.c || 0),
        };
      }
    }
    return this._pruneDailyMap(out);
  },

  _mergeSummaryRecords(local, cloud, subjectId, peersById) {
    let l =
      typeof SubjectSummary !== "undefined"
        ? SubjectSummary.normalize(local)
        : this._summaryFromStats(local || {});
    let c =
      typeof SubjectSummary !== "undefined"
        ? SubjectSummary.normalize(cloud)
        : this._summaryFromStats(cloud || {});
    // 汚染側は空にしてからマージ（Math.max で汚染を拾わない）
    if (subjectId && this._looksLikeCrossSubjectPollution(subjectId, l, peersById)) {
      l =
        typeof SubjectSummary !== "undefined"
          ? SubjectSummary.empty()
          : this._summaryFromStats(this._empty());
    }
    if (subjectId && this._looksLikeCrossSubjectPollution(subjectId, c, peersById)) {
      c =
        typeof SubjectSummary !== "undefined"
          ? SubjectSummary.empty()
          : this._summaryFromStats(this._empty());
    }
    const localAns = Number(l.answered) || 0;
    const cloudAns = Number(c.answered) || 0;
    // 本体キーに実データがあるとき、クラウドだけ異常に大きい場合は本体を優先
    if (localAns > 0 && cloudAns > localAns + 50 && cloudAns > localAns * 3) {
      return {
        ...l,
        daily: this._pickSubjectDaily(l.daily, c.daily, null, localAns),
      };
    }
    // 端末に他科目コピーが残っているとき、健全なクラウドを Math.max で潰さない
    if (
      subjectId &&
      cloudAns > 0 &&
      localAns > cloudAns * 2 + 50 &&
      (this._looksLikeNearCloneOfPeers(l, subjectId, peersById) ||
        this._looksLikeCrossSubjectPollution(subjectId, l, peersById) ||
        localAns >= 1000)
    ) {
      return {
        ...c,
        daily: this._pickSubjectDaily(c.daily, null, null, cloudAns),
      };
    }
    const primary = localAns >= cloudAns ? l : c;
    const answered = Math.max(localAns, cloudAns);
    const correct = Math.max(Number(l.correct) || 0, Number(c.correct) || 0);
    // 正答率は累計から再計算（choiceAccPct の Math.max は科目ずれで嘘になる）
    const choiceAccPct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return {
      ...primary,
      answered,
      correct,
      inputAnswered: Math.max(Number(l.inputAnswered) || 0, Number(c.inputAnswered) || 0),
      inputCorrect: Math.max(Number(l.inputCorrect) || 0, Number(c.inputCorrect) || 0),
      masteredChoice: Math.max(Number(l.masteredChoice) || 0, Number(c.masteredChoice) || 0),
      masteredInput: Math.max(Number(l.masteredInput) || 0, Number(c.masteredInput) || 0),
      choiceAccPct,
      daily: this._mergeDailyMaps(l.daily, c.daily),
      rankName: answered > 0 || (Number(primary.masteredChoice) || 0) > 0 ? primary.rankName || "" : "",
      rankAlias: answered > 0 || (Number(primary.masteredChoice) || 0) > 0 ? primary.rankAlias || "" : "",
      rankColor: answered > 0 || (Number(primary.masteredChoice) || 0) > 0 ? primary.rankColor || "" : "",
      rankFg: answered > 0 || (Number(primary.masteredChoice) || 0) > 0 ? primary.rankFg || "" : "",
    };
  },

  _mergeQuestionRow(a, b) {
    if (!a) return { ...(b || {}) };
    if (!b) return { ...(a || {}) };
    return {
      a: Math.max(a.a || 0, b.a || 0),
      c: Math.max(a.c || 0, b.c || 0),
      k: Math.max(a.k || 0, b.k || 0),
      ck: Math.max(a.ck || 0, b.ck || 0),
      ia: Math.max(a.ia || 0, b.ia || 0),
      ic: Math.max(a.ic || 0, b.ic || 0),
      ik: Math.max(a.ik || 0, b.ik || 0),
    };
  },

  _qMapSize(q) {
    return q && typeof q === "object" && !Array.isArray(q) ? Object.keys(q).length : 0;
  },

  /** 問題別成績マップの統合（answered が無くても落とさない） */
  _mergeQMaps(a, b) {
    const out = { ...(a || {}) };
    for (const [id, row] of Object.entries(b || {})) {
      out[id] = this._mergeQuestionRow(out[id], row);
    }
    return out;
  },

  /**
   * 薄い detail で厚い detail を上書きしない。
   * （サマリだけのマージ結果や空 q をクラウドへ書いて習得を消す事故防止）
   */
  _detailIsThinner(next, prev) {
    if (!prev) return false;
    const prevQ = this._qMapSize(prev.q);
    const nextQ = this._qMapSize(next && next.q);
    if (prevQ >= 30 && nextQ < Math.max(10, Math.floor(prevQ * 0.5))) return true;
    const prevChoice = Array.isArray(prev.choiceLog) ? prev.choiceLog.length : 0;
    const nextChoice = Array.isArray(next && next.choiceLog) ? next.choiceLog.length : 0;
    if (prevChoice >= 100 && nextChoice < Math.floor(prevChoice * 0.5)) return true;
    return false;
  },

  /** 2つの成績を統合。集計は大きい方、choiceLog/inputLog は長い方を採用 */
  _mergeStatsPair(primary, secondary) {
    primary = this._normalize(primary || this._empty());
    if (!secondary) return primary;
    const secondaryRaw = secondary;
    secondary = this._normalize(secondary);
    const hasSecondarySignal =
      (Number(secondary.answered) || 0) > 0 ||
      this._qMapSize(secondaryRaw.q) > 0 ||
      this._qMapSize(secondary.q) > 0 ||
      (Array.isArray(secondaryRaw.choiceLog) && secondaryRaw.choiceLog.length > 0) ||
      (Array.isArray(secondaryRaw.inputLog) && secondaryRaw.inputLog.length > 0) ||
      this._dailyAheadOfCloud(secondary, null);
    if (!hasSecondarySignal) return primary;

    const q = this._mergeQMaps(primary.q, secondary.q);
    const daily = this._mergeDailyMaps(primary.daily, secondary.daily);
    const fromQ = this._countersFromQ(q, null);
    const merged = {
      ...primary,
      answered: Math.max(primary.answered, secondary.answered, fromQ.answered),
      correct: Math.max(primary.correct, secondary.correct, fromQ.correct),
      inputAnswered: Math.max(
        primary.inputAnswered || 0,
        secondary.inputAnswered || 0,
        fromQ.inputAnswered
      ),
      inputCorrect: Math.max(
        primary.inputCorrect || 0,
        secondary.inputCorrect || 0,
        fromQ.inputCorrect
      ),
      choiceLog: this._pickBetterLog(primary, secondary, "choiceLog"),
      inputLog: this._pickBetterLog(primary, secondary, "inputLog"),
      q,
      daily,
    };
    merged.masteredChoice = Math.max(
      this._countChoiceMasteredFromQ(q),
      Number(primary.masteredChoice) || 0,
      Number(secondary.masteredChoice) || 0
    );
    merged.masteredInput = Math.max(
      this._countInputMasteredFromQ(q),
      Number(primary.masteredInput) || 0,
      Number(secondary.masteredInput) || 0
    );
    return this._normalize(merged);
  },

  /** detail 分離後に log だけ欠落しているときの再保存判定 */
  _detailNeedsBackfill(stats) {
    const answered = Number(stats && stats.answered) || 0;
    const inputAnswered = Number(stats && stats.inputAnswered) || 0;
    const choiceLen = Array.isArray(stats && stats.choiceLog) ? stats.choiceLog.length : 0;
    const inputLen = Array.isArray(stats && stats.inputLog) ? stats.inputLog.length : 0;
    const choiceAttempts = Math.max(0, answered - inputAnswered);
    if (choiceAttempts > 20 && choiceLen === 0) return true;
    if (inputAnswered > 10 && inputLen === 0) return true;
    return false;
  },

  /** ローカルの日別成績がクラウドより進んでいるか */
  _dailyAheadOfCloud(localStats, cloudData) {
    const localDaily = this._normalizeDaily(localStats && localStats.daily);
    const cloudDaily = this._normalizeDaily(cloudData && cloudData.daily);
    for (const [k, v] of Object.entries(localDaily)) {
      const cv = cloudDaily[k];
      if (!cv || (v.a || 0) > (cv.a || 0) || (v.c || 0) > (cv.c || 0)) return true;
    }
    return false;
  },

  /** 累計カウンタがクラウドより進んでいるか */
  _countersAheadOfCloud(local, cloudData) {
    if (!local) return false;
    if (!cloudData) return (Number(local.answered) || 0) > 0;
    return (
      (Number(local.answered) || 0) > (Number(cloudData.answered) || 0) ||
      (Number(local.correct) || 0) > (Number(cloudData.correct) || 0) ||
      (Number(local.inputAnswered) || 0) > (Number(cloudData.inputAnswered) || 0) ||
      (Number(local.masteredChoice) || 0) > (Number(cloudData.masteredChoice) || 0)
    );
  },

  /** マージ後の成績をクラウドへ送る必要があるか */
  _statsNeedCloudPush(mergedStats, cloudMainData, localFallback) {
    if (!cloudMainData) {
      return Boolean(
        localFallback &&
          ((Number(localFallback.answered) || 0) > 0 || this._dailyAheadOfCloud(localFallback, null))
      );
    }
    if (this._needsCloudSplit(cloudMainData)) return true;
    if (this._detailNeedsBackfill(mergedStats)) return true;
    if (localFallback && this._dailyAheadOfCloud(localFallback, cloudMainData)) return true;
    if (localFallback && this._countersAheadOfCloud(localFallback, cloudMainData)) return true;
    return false;
  },

  _needsCloudSplit(mainData) {
    if (!mainData) return false;
    if (Number(mainData.schemaVersion) >= STATS_SCHEMA_VERSION) return false;
    return Boolean(mainData.q || mainData.choiceLog || mainData.inputLog);
  },

  async _fetchCloudStats(uid, db, subjectId, localFallback) {
    const ref = db.collection("users").doc(uid).collection("subjects").doc(subjectId);
    const detailRef = ref.collection("detail").doc(STATS_DETAIL_DOC_ID);
    const [mainSnap, detailSnap] = await Promise.all([ref.get(), detailRef.get()]);
    let local = localFallback ? this._normalize(localFallback) : null;
    if (local && this._looksLikeSapPollution(subjectId, local)) {
      local = this._empty();
    }
    if (!mainSnap.exists) {
      const stats = this._recoverThinStats(local || this._empty(), subjectId);
      if (
        !this._looksLikeSapPollution(subjectId, stats) &&
        this._statsNeedCloudPush(stats, null, local)
      ) {
        void this._cloudSaveAsyncForSubject(subjectId, stats);
      }
      return stats;
    }
    const mainData = mainSnap.data() || null;
    // クラウド本体が科目間コピー汚染ならローカル（清掃後）を優先し、汚染を再 Math.max しない
    if (this._looksLikeCrossSubjectPollution(subjectId, mainData)) {
      const clean = this._recoverThinStats(local || this._empty(), subjectId);
      void this._cloudSaveAsyncForSubject(subjectId, clean, {
        preferIncomingCounters: true,
        replaceDetailQ: true,
        skipLocalWrite: true,
        scrubConfirmed: true,
      });
      return clean;
    }
    const merged = this._mergeCloudDocuments(
      mainData,
      detailSnap.exists ? detailSnap.data() : null
    );
    let stats = this._normalize(merged);
    if (local) {
      stats = this._mergeStatsPair(stats, local);
    }
    stats = this._scrubPollutedStats(subjectId, stats);
    const beforeRestoreAnswered = Number(stats.answered) || 0;
    stats = this._recoverThinStats(stats, subjectId);
    stats = this._restoreCountersFromQ(stats);
    if (this._looksLikeSapPollution(subjectId, stats)) {
      stats = this._empty();
      void this._cloudSaveAsyncForSubject(subjectId, stats, {
        preferIncomingCounters: true,
        replaceDetailQ: true,
        skipLocalWrite: true,
        scrubConfirmed: true,
      });
      return stats;
    }
    const afterAnswered = Number(stats.answered) || 0;
    const mainAnswered = Number(mainData.answered) || 0;
    const forcedDown =
      afterAnswered < beforeRestoreAnswered ||
      (afterAnswered < mainAnswered &&
        this._countersInflatedVsQ(mainData, this._countersFromQ(stats.q, null)));
    // q から習得数を回復／膨らみ強制下げした場合はサマリへ戻す
    if (
      mainData &&
      (forcedDown ||
        (Number(stats.masteredChoice) || 0) > (Number(mainData.masteredChoice) || 0) ||
        (Number(stats.masteredInput) || 0) > (Number(mainData.masteredInput) || 0) ||
        afterAnswered > mainAnswered ||
        (Number(stats.correct) || 0) > (Number(mainData.correct) || 0) ||
        this._statsNeedCloudPush(stats, mainData, local))
    ) {
      void this._cloudSaveAsyncForSubject(
        subjectId,
        stats,
        forcedDown
          ? {
              preferIncomingCounters: true,
              replaceDetailQ: true,
              scrubConfirmed: true,
            }
          : {}
      );
    }
    return stats;
  },

  /** q が厚いのに累計が薄い／0 のとき、q からカウンタを復元する。膨らみは q へ強制。 */
  _restoreCountersFromQ(stats) {
    const base = this._normalize(stats || this._empty());
    const qSize = this._qMapSize(base.q);
    if (qSize < 5) return base;
    const fromQ = this._countersFromQ(base.q, null);
    const mc = this._countChoiceMasteredFromQ(base.q);
    const mi = this._countInputMasteredFromQ(base.q);
    const answered = Number(base.answered) || 0;

    if (this._countersInflatedVsQ(base, fromQ)) {
      console.info("成績カウンタを q へ強制 reconcile:", this.subjectId || "", {
        beforeAnswered: answered,
        afterAnswered: fromQ.answered,
        qSize,
      });
      return this._normalize({
        ...base,
        answered: fromQ.answered,
        correct: fromQ.correct,
        inputAnswered: fromQ.inputAnswered,
        inputCorrect: fromQ.inputCorrect,
        masteredChoice: mc,
        masteredInput: mi,
      });
    }

    if (fromQ.answered <= answered && mc <= (Number(base.masteredChoice) || 0)) {
      return base;
    }
    console.info("成績カウンタを q から復元:", this.subjectId || "", {
      beforeAnswered: base.answered,
      afterAnswered: Math.max(answered, fromQ.answered),
      qSize,
    });
    return this._normalize({
      ...base,
      answered: Math.max(answered, fromQ.answered),
      correct: Math.max(Number(base.correct) || 0, fromQ.correct),
      inputAnswered: Math.max(Number(base.inputAnswered) || 0, fromQ.inputAnswered),
      inputCorrect: Math.max(Number(base.inputCorrect) || 0, fromQ.inputCorrect),
      masteredChoice: Math.max(Number(base.masteredChoice) || 0, mc),
      masteredInput: Math.max(Number(base.masteredInput) || 0, mi),
    });
  },

  /**
   * 累計はあるが q / 正誤ログが薄いとき、旧キーから詳細を戻す。
   */
  _recoverDetailIfThin(stats, subjectId) {
    let base = this._normalize(stats || this._empty());
    const answered = Number(base.answered) || 0;
    const choiceAttempts = this._estimateChoiceAttempts(base);
    const qSize = this._qMapSize(base.q);
    const choiceLen = Array.isArray(base.choiceLog) ? base.choiceLog.length : 0;
    const inputLen = Array.isArray(base.inputLog) ? base.inputLog.length : 0;
    const qThin = answered >= 50 && qSize < Math.max(20, Math.floor(answered * 0.02));
    const logThin =
      choiceAttempts >= 100 && choiceLen < Math.max(50, Math.floor(choiceAttempts * 0.25));
    if (!qThin && !logThin) return base;

    const candidates = [];
    const legacyKey = this._legacyStorageKeyForSubject(subjectId);
    if (legacyKey) candidates.push(legacyKey);
    if (subjectId === "sap") {
      candidates.push("biz_dojo_sap_stats_v1");
      candidates.push("sap_tcode_dojo_stats_v1");
    }

    const pool = [base];
    for (const key of candidates) {
      const legacy = this._loadFromKey(key);
      if (
        this._qMapSize(legacy.q) > 0 ||
        (Array.isArray(legacy.choiceLog) && legacy.choiceLog.length > 0) ||
        (Number(legacy.answered) || 0) > 0
      ) {
        pool.push(legacy);
      }
    }

    let bestQ = base;
    for (const cand of pool) {
      if (this._qMapSize(cand.q) > this._qMapSize(bestQ.q)) bestQ = cand;
    }
    if (bestQ !== base && this._qMapSize(bestQ.q) > qSize) {
      console.info("成績詳細 q を復元:", subjectId, {
        beforeQ: qSize,
        afterQ: this._qMapSize(bestQ.q),
      });
      base = this._mergeStatsPair(base, bestQ);
    }

    const longestChoice = this._pickLongestLogFromStatsList(pool, "choiceLog");
    const longestInput = this._pickLongestLogFromStatsList(pool, "inputLog");
    if (longestChoice.length > (Array.isArray(base.choiceLog) ? base.choiceLog.length : 0)) {
      console.info("正誤ログ choiceLog を復元:", subjectId, {
        before: choiceLen,
        after: longestChoice.length,
      });
      base.choiceLog = longestChoice;
    }
    if (longestInput.length > (Array.isArray(base.inputLog) ? base.inputLog.length : 0)) {
      console.info("正誤ログ inputLog を復元:", subjectId, {
        before: inputLen,
        after: longestInput.length,
      });
      base.inputLog = longestInput;
    }

    return this._restoreCountersFromQ(base);
  },

  /** q が空なのに累計だけある場合、旧キーから詳細を拾って回復を試みる */
  _recoverThinStats(stats, subjectId) {
    let base = this._normalize(stats || this._empty());
    base = this._restoreCountersFromQ(base);
    base = this._recoverDetailIfThin(base, subjectId);
    if (this._qMapSize(base.q) > 0) return base;
    if ((Number(base.answered) || 0) < 20 && (Number(base.correct) || 0) < 20) {
      const legacyKey = this._legacyStorageKeyForSubject(subjectId);
      if (!legacyKey) return base;
      const legacy = this._loadFromKey(legacyKey);
      if ((Number(legacy.answered) || 0) === 0 && this._qMapSize(legacy.q) === 0) return base;
      console.info("成績を旧ストレージキーから回復:", subjectId, legacyKey);
      return this._mergeStatsPair(base, legacy);
    }
    const legacyKey = this._legacyStorageKeyForSubject(subjectId);
    if (!legacyKey) return base;
    const legacy = this._loadFromKey(legacyKey);
    if (this._qMapSize(legacy.q) === 0) return base;
    console.info("成績詳細を旧ストレージキーから回復:", subjectId, legacyKey);
    return this._mergeStatsPair(base, legacy);
  },

  // ===== 内部処理 =====
  _empty() {
    return {
      answered: 0,
      correct: 0,
      inputAnswered: 0,
      inputCorrect: 0,
      masteredChoice: 0,
      masteredInput: 0,
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
    const countedChoice = this._countChoiceMasteredFromQ(q);
    const countedInput = this._countInputMasteredFromQ(q);
    const storedChoice = typeof data.masteredChoice === "number" ? data.masteredChoice : null;
    const storedInput = typeof data.masteredInput === "number" ? data.masteredInput : null;
    // q があるときは再集計で回復。q が空のときは保存済み数値を落とさない
    const masteredChoice =
      this._qMapSize(q) > 0
        ? Math.max(storedChoice == null ? 0 : storedChoice, countedChoice)
        : storedChoice == null
          ? countedChoice
          : storedChoice;
    const masteredInput =
      this._qMapSize(q) > 0
        ? Math.max(storedInput == null ? 0 : storedInput, countedInput)
        : storedInput == null
          ? countedInput
          : storedInput;
    return {
      answered: (data && data.answered) || 0,
      correct: (data && data.correct) || 0,
      inputAnswered: (data && data.inputAnswered) || 0,
      inputCorrect: (data && data.inputCorrect) || 0,
      masteredChoice,
      masteredInput,
      rankName: (data && data.rankName) || "",
      rankAlias: (data && data.rankAlias) || "",
      rankColor: (data && data.rankColor) || "",
      rankFg: (data && data.rankFg) || "",
      choiceAccPct: Number(data && data.choiceAccPct) || 0,
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

  _loadLocalForSubject() {
    if (!this.subjectId) return this._loadLocal();
    return this._loadLocalCandidatesForSubject(this.subjectId, this.KEY);
  },

  /** 明示キー／スナップショット指定可（他科目保存中に this.KEY を誤って潰さない） */
  _writeLocal(key, stats) {
    const storageKey = key || this.KEY;
    const payload = stats != null ? stats : this.stats;
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
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
      void (async () => {
        if (this.mode !== "cloud") {
          this.updateSyncStatusUi();
          return;
        }
        const ok = await this.flushPendingCloudSave();
        if (ok) this._clearUnsynced();
        this.updateSyncStatusUi();
      })();
    });
  },

  _persist() {
    // オフラインでも成績が残るよう、常に端末へ書く
    this._writeLocal();
    if (this.mode !== "cloud") {
      // 未ログインは端末のみ（anonUsers へは送らない）
      return;
    }
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline) {
      this._bumpUnsynced(1);
      this._setPending(true);
      return;
    }
    void this._cloudSaveAsync().then((ok) => {
      if (ok) this._clearUnsynced();
      else {
        this._setPending(true);
        this._bumpUnsynced(1);
        this.updateSyncStatusUi();
      }
    });
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

  /** 未ログインのクラウド同期は行わない（ログイン成績の混入防止） */
  _scheduleAnonSave() {
    if (this._anonSaveTimer) {
      clearTimeout(this._anonSaveTimer);
      this._anonSaveTimer = null;
    }
  },

  async _anonSaveAsync() {
    return false;
  },

  _anonSubjectRef() {
    return null;
  },

  _anonDetailRef() {
    return null;
  },

  _subjectRef(subjectId) {
    const sid = subjectId || this.subjectId;
    if (!this.db || !this.uid || !sid) return null;
    return this.db.collection("users").doc(this.uid).collection("subjects").doc(sid);
  },

  async _cloudLoad() {
    const ref = this._subjectRef();
    if (!ref) {
      this.stats = this._scrubPollutedStats(
        this.subjectId,
        this._recoverThinStats(this._loadLocal(), this.subjectId)
      );
      return this.stats;
    }
    try {
      const mainSnap = await ref.get();
      if (mainSnap.exists) {
        const raw = mainSnap.data();
        const needsMasteredBackfill =
          typeof raw.masteredChoice !== "number" && (Number(raw.answered) || 0) > 0;
        let local = this._loadLocalForSubject();
        local = this._scrubPollutedStats(this.subjectId, local);
        this.stats = await this._fetchCloudStats(this.uid, this.db, this.subjectId, local);
        this.stats = this._scrubPollutedStats(this.subjectId, this.stats);
        this.stats = this._restoreCountersFromQ(this.stats);
        this._writeLocal();
        this._touchLocalSummaryCache();
        if (
          !this._looksLikeSapPollution(this.subjectId, this.stats) &&
          (needsMasteredBackfill || this._statsNeedCloudPush(this.stats, raw, local))
        ) {
          void this._cloudSaveAsync();
        }
      } else {
        this.stats = this._scrubPollutedStats(
          this.subjectId,
          this._recoverThinStats(this._empty(), this.subjectId)
        );
        this._writeLocal();
        if ((Number(this.stats.answered) || 0) > 0) {
          void this._cloudSaveAsync();
        }
      }
      return this.stats;
    } catch (e) {
      console.error("クラウド成績の読み込みに失敗:", e);
      this.stats = this._scrubPollutedStats(
        this.subjectId,
        this._recoverThinStats(this._loadLocal(), this.subjectId)
      );
      return this.stats;
    }
  },

  _buildSummaryPayload(stats, subjectId) {
    const s = stats != null ? stats : this.stats;
    const sid = subjectId != null ? subjectId : this.subjectId;
    if (s === this.stats) {
      this._syncRankSnapshot(
        typeof createRankContextFromLoaded === "function" && typeof QUIZ_DATA !== "undefined"
          ? createRankContextFromLoaded()
          : null
      );
    }
    const payload = {
      answered: s.answered,
      correct: s.correct,
      inputAnswered: s.inputAnswered || 0,
      inputCorrect: s.inputCorrect || 0,
      masteredChoice: Number(s.masteredChoice) || 0,
      masteredInput: Number(s.masteredInput) || 0,
      rankName: s.rankName || "",
      rankAlias: s.rankAlias || "",
      rankColor: s.rankColor || "",
      rankFg: s.rankFg || "",
      choiceAccPct: Number(s.choiceAccPct) || 0,
      daily: this._normalizeDaily(s.daily),
      subjectId: sid,
      schemaVersion: STATS_SCHEMA_VERSION,
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

  _buildDetailPayload(stats, subjectId) {
    const s = stats != null ? stats : this.stats;
    const sid = subjectId != null ? subjectId : this.subjectId;
    return {
      q: s.q || {},
      choiceLog: Array.isArray(s.choiceLog) ? s.choiceLog : [],
      inputLog: Array.isArray(s.inputLog) ? s.inputLog : [],
      subjectId: sid,
    };
  },

  _legacyPayloadForAnon() {
    return Object.assign({}, this._buildSummaryPayload(), this._buildDetailPayload());
  },

  _buildCloudPayload() {
    return this._legacyPayloadForAnon();
  },

  _saveQueue: Promise.resolve(),

  /**
   * 科目別クラウド保存。this.stats / subjectId は書き換えない（スナップショットのみ）。
   * オプション（preferIncomingCounters 等）も必ず渡す。
   */
  async _cloudSaveAsyncForSubject(subjectId, statsSnapshot, options = {}) {
    return this._cloudSaveAsync({
      ...options,
      subjectId,
      stats: this._normalize(statsSnapshot),
      skipLocalWrite: options.skipLocalWrite !== false,
    });
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

  _cloudSave(options = {}) {
    void this._cloudSaveAsync(options);
  },

  async _cloudSaveAsync(options = {}) {
    const run = async () => {
      if (!this._ensureCloudAuth()) return false;
      const subjectId = options.subjectId != null ? options.subjectId : this.subjectId;
      const stats =
        options.stats != null ? this._normalize(options.stats) : this.stats;
      const ref = this._subjectRef(subjectId);
      if (!ref || !subjectId) return false;

      // 汚染ペイロードはクラウドへ書かない（科目間指紋コピーの再定着を防ぐ）
      if (
        !options.scrubConfirmed &&
        this._looksLikeCrossSubjectPollution(subjectId, stats)
      ) {
        console.warn("汚染ペイロードのクラウド保存を拒否:", subjectId);
        return false;
      }

      if (!options.skipLocalWrite) {
        // 現在科目の保存時のみ this.KEY へ書く。他科目スナップショットは KEY を触らない
        if (!options.stats || subjectId === this.subjectId) {
          this._writeLocal(this.KEY, stats);
        }
      }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this._setPending(true);
        if (this.getUnsyncedCount() < 1) this._bumpUnsynced(1);
        this.updateSyncStatusUi();
        return false;
      }

      this._saveGeneration += 1;
      const gen = this._saveGeneration;
      this._setPending(true);
      try {
        await this._ensureUserProfile();
        let summary = this._buildSummaryPayload(stats, subjectId);
        let detail = this._buildDetailPayload(stats, subjectId);
        const detailRef = this._detailRef(subjectId);
        const FieldValue =
          typeof firebase !== "undefined" &&
          firebase.firestore &&
          firebase.firestore.FieldValue
            ? firebase.firestore.FieldValue
            : null;
        try {
          const existingSnap = await ref.get();
          if (existingSnap.exists) {
            const existing = existingSnap.data() || {};
            const existingPolluted = this._looksLikeSapPollution(subjectId, existing);
            const incomingDaily = this._normalizeDaily(summary.daily);
            const existingDaily = this._normalizeDaily(existing.daily);
            if (
              existingPolluted ||
              options.scrubConfirmed ||
              (this._dailyInconsistentWithAnswered(existingDaily, summary.answered) &&
                !this._dailyInconsistentWithAnswered(incomingDaily, summary.answered))
            ) {
              summary.daily = incomingDaily;
            } else {
              summary.daily = this._mergeDailyMaps(existingDaily, incomingDaily);
            }
            if (options.preferIncomingCounters || options.scrubConfirmed || existingPolluted) {
              summary.answered = Number(summary.answered) || 0;
              summary.correct = Number(summary.correct) || 0;
              summary.inputAnswered = Number(summary.inputAnswered) || 0;
              summary.inputCorrect = Number(summary.inputCorrect) || 0;
              summary.masteredChoice = Number(summary.masteredChoice) || 0;
              summary.masteredInput = Number(summary.masteredInput) || 0;
            } else {
              summary.masteredChoice = Math.max(
                Number(existing.masteredChoice) || 0,
                Number(summary.masteredChoice) || 0
              );
              summary.masteredInput = Math.max(
                Number(existing.masteredInput) || 0,
                Number(summary.masteredInput) || 0
              );
              summary.answered = Math.max(
                Number(existing.answered) || 0,
                Number(summary.answered) || 0
              );
              summary.correct = Math.max(
                Number(existing.correct) || 0,
                Number(summary.correct) || 0
              );
              summary.inputAnswered = Math.max(
                Number(existing.inputAnswered) || 0,
                Number(summary.inputAnswered) || 0
              );
              summary.inputCorrect = Math.max(
                Number(existing.inputCorrect) || 0,
                Number(summary.inputCorrect) || 0
              );
            }
          }
        } catch (e) {
          console.warn("成績サマリの既存読込に失敗:", e);
        }
        if (FieldValue) {
          summary.q = FieldValue.delete();
          summary.choiceLog = FieldValue.delete();
          summary.inputLog = FieldValue.delete();
        }
        await ref.set(summary, { merge: true });
        if (detailRef) {
          try {
            if (options.replaceDetailQ || options.scrubConfirmed) {
              await detailRef.set({
                q: detail.q || {},
                choiceLog: Array.isArray(detail.choiceLog) ? detail.choiceLog : [],
                inputLog: Array.isArray(detail.inputLog) ? detail.inputLog : [],
                subjectId,
              });
            } else {
              const existingSnap = await detailRef.get();
              if (existingSnap.exists) {
                const prev = existingSnap.data() || {};
                const nextStats = {
                  ...stats,
                  choiceLog: detail.choiceLog,
                  inputLog: detail.inputLog,
                };
                const prevStats = {
                  ...stats,
                  choiceLog: prev.choiceLog,
                  inputLog: prev.inputLog,
                };
                const mergedDetail = {
                  q: this._mergeQMaps(prev.q, detail.q),
                  choiceLog: this._pickBetterLog(nextStats, prevStats, "choiceLog"),
                  inputLog: this._pickBetterLog(nextStats, prevStats, "inputLog"),
                  subjectId,
                };
                if (this._detailIsThinner(mergedDetail, prev)) {
                  console.warn("成績 detail の薄い上書きをスキップ:", subjectId);
                } else {
                  detail = mergedDetail;
                  await detailRef.set(detail, { merge: true });
                }
              } else if (!this._detailIsThinner(detail, null) || this._qMapSize(detail.q) > 0) {
                await detailRef.set(detail, { merge: true });
              }
            }
          } catch (e) {
            console.warn("成績 detail の保存に失敗（サマリは保存済）:", e);
          }
        }
        this._touchLocalSummaryCache();
        if (gen === this._saveGeneration) {
          // 現在科目の通常保存が成功したら未送信をクリア。他科目スナップショットでは落とさない
          if (!options.stats || subjectId === this.subjectId) {
            this._clearUnsynced();
          }
        }
        return true;
      } catch (e) {
        this._setPending(true);
        if (this.getUnsyncedCount() < 1) this._bumpUnsynced(1);
        this.updateSyncStatusUi();
        console.error("クラウド保存に失敗:", e);
        return false;
      }
    };

    const queued = this._saveQueue.then(run, run);
    this._saveQueue = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  },
};
