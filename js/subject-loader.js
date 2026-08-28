/**
 * 科目パックの動的読込・選択状態（ビジネス道場）
 *
 * - subjects/<id>/subject.js … ブランド・段位など（ローカル）
 * - contentBase … 問題マスタ（SAP道場 / 学習道場の公開 URL）
 */
const SubjectLoader = (function () {
  const SELECTED_KEY = "biz_dojo_selected_subject";
  /** URL 第1セグメントとして科目にしないパス */
  const RESERVED_PATH_SEGMENTS = new Set([
    "admin",
    "js",
    "css",
    "config",
    "data",
    "subjects",
    "assets",
    "functions",
    "index.html",
  ]);
  let currentId = null;
  let loadedId = null;
  const versionCache = new Map();

  function getSelected() {
    return localStorage.getItem(SELECTED_KEY);
  }

  function setSelected(id) {
    localStorage.setItem(SELECTED_KEY, id);
    currentId = id;
  }

  function clearSelected() {
    localStorage.removeItem(SELECTED_KEY);
    currentId = null;
  }

  function findMeta(id) {
    return (typeof SUBJECT_REGISTRY !== "undefined" ? SUBJECT_REGISTRY : []).find((s) => s.id === id);
  }

  function pathFirstSegment() {
    try {
      const parts = (location.pathname || "/").split("/").filter(Boolean);
      return parts[0] || null;
    } catch (e) {
      return null;
    }
  }

  /** `/sap` など URL から科目 ID を取る（無効・予約パスは null） */
  function getPathSubjectId() {
    const seg = pathFirstSegment();
    if (!seg || RESERVED_PATH_SEGMENTS.has(seg)) return null;
    const meta = findMeta(seg);
    if (!meta || meta.enabled === false) return null;
    return meta.id;
  }

  /** 未知の第1セグメント（例: /foo）ならその文字列 */
  function getUnknownPathSegment() {
    const seg = pathFirstSegment();
    if (!seg || RESERVED_PATH_SEGMENTS.has(seg)) return null;
    if (findMeta(seg)) return null;
    return seg;
  }

  /**
   * 起動時に使う科目 ID（path 優先、なければ localStorage）
   */
  function resolveBootSubjectId() {
    return getPathSubjectId() || getSelected();
  }

  /** 科目ホーム等: `/sap` + 既存 search/hash に揃える */
  function syncUrlForSubject(id) {
    if (!id || !window.history || !window.history.replaceState) return;
    const wantPath = "/" + id;
    const cur = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (cur === wantPath) return;
    history.replaceState(null, "", wantPath + (location.search || "") + (location.hash || ""));
  }

  /** 科目ピッカー: `/` に戻す */
  function syncUrlForPicker() {
    if (!window.history || !window.history.replaceState) return;
    const cur = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (cur === "/" && !location.hash) return;
    history.replaceState(null, "", "/" + (location.search || ""));
  }

  function resolveContentBase(meta) {
    // ローカル開発用: ?contentLocal=1 で contentBase を path にフォールバック（非推奨）
    try {
      if (new URLSearchParams(location.search).get("contentLocal") === "1") {
        return meta.path.replace(/\/$/, "");
      }
    } catch (e) {
      /* ignore */
    }
    return (meta.contentBase || meta.path || "").replace(/\/$/, "");
  }

  async function resolveCacheBust(meta) {
    const url = meta.contentVersionUrl;
    if (!url) {
      return typeof APP_VERSION !== "undefined" ? APP_VERSION : String(Date.now());
    }
    if (versionCache.has(url)) return versionCache.get(url);
    try {
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now(), {
        cache: "no-store",
      });
      if (res.ok) {
        const text = await res.text();
        const m = text.match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (m) {
          versionCache.set(url, m[1]);
          return m[1];
        }
      }
    } catch (e) {
      console.warn("マスタ version の取得に失敗:", url, e);
    }
    const fallback = typeof APP_VERSION !== "undefined" ? APP_VERSION : String(Date.now());
    versionCache.set(url, fallback);
    return fallback;
  }

  function loadScript(src, cacheBust) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-subject-src="${src}"]`);
      if (existing) existing.remove();
      const s = document.createElement("script");
      const v = cacheBust || (typeof APP_VERSION !== "undefined" ? APP_VERSION : String(Date.now()));
      s.src = src + (src.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(v);
      s.dataset.subjectSrc = src;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("スクリプト読込失敗: " + src));
      document.head.appendChild(s);
    });
  }

  async function loadOptionalScript(src, cacheBust) {
    try {
      await loadScript(src, cacheBust);
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearGlobals() {
    if (typeof window === "undefined") return;
    window.SUBJECT = undefined;
    window.QUIZ_DATA = undefined;
    window.JUDGMENT_DATA = undefined;
    window.CHANGELOG = undefined;
    window.LEARNING_BACKLOG = undefined;
    window.TCODE_REF = undefined;
    window.ABAP_SYNTAX = undefined;
  }

  /**
   * judgment-questions.js → questions.js の順で取得し、QUIZ_DATA を確定する。
   * マスタは const 宣言のため script タグ再注入だと再宣言エラー／科目切替失敗になる。
   * また questions.js 末尾が JUDGMENT_DATA を連結するため、並列読込だと正誤が欠落する。
   * fetch + Function で同一スコープ評価し、window に載せる。
   */
  async function loadQuizBundle(contentBase, bust) {
    const withBust = (url) =>
      url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(bust);

    async function fetchText(src) {
      // ?v= 付きなら force-cache（マスタ更新時は version が変わる）
      const res = await fetch(withBust(src), { cache: "force-cache", mode: "cors" });
      if (!res.ok) throw new Error("fetch failed: " + src);
      return res.text();
    }

    // 評価は直列必須だが、ネットワーク取得は並列で短縮
    const [jSettled, qSrc] = await Promise.all([
      fetchText(contentBase + "/judgment-questions.js").catch(() => "var JUDGMENT_DATA = [];"),
      fetchText(contentBase + "/questions.js"),
    ]);
    const jSrc = jSettled || "var JUDGMENT_DATA = [];";
    const bundle = new Function(
      jSrc +
        "\n" +
        qSrc +
        "\n;return{" +
        "quiz:typeof QUIZ_DATA!=='undefined'?QUIZ_DATA:[]," +
        "judgment:typeof JUDGMENT_DATA!=='undefined'?JUDGMENT_DATA:[]" +
        "};"
    )();

    const quiz = Array.isArray(bundle.quiz) ? bundle.quiz : [];
    if (!quiz.length) {
      throw new Error("問題データが空です: " + contentBase);
    }
    window.QUIZ_DATA = quiz;
    window.JUDGMENT_DATA = Array.isArray(bundle.judgment) ? bundle.judgment : [];
  }

  /** Tコード／構文など科目追加データ（ホーム表示後に呼ぶ） */
  async function loadExtraScripts(id) {
    const meta = findMeta(id);
    if (!meta || !meta.enabled) return;
    const contentBase = resolveContentBase(meta);
    const bust = await resolveCacheBust(meta);
    const extras =
      (typeof SUBJECT !== "undefined" && SUBJECT && SUBJECT.extraScripts) || [];
    if (!extras.length) return;
    await Promise.all(
      extras.map((file) => loadScript(contentBase + "/" + String(file).replace(/^\//, ""), bust))
    );
  }

  async function loadSubject(id) {
    const meta = findMeta(id);
    if (!meta || !meta.enabled) throw new Error("科目が見つかりません: " + id);

    const localBase = meta.path.replace(/\/$/, "");
    const contentBase = resolveContentBase(meta);
    const bust = await resolveCacheBust(meta);

    clearGlobals();

    // 1) ローカル subject.js（ブランド・段位）— 問題データと並列
    const subjectLoad = loadScript(localBase + "/subject.js", bust);
    const quizLoad = loadQuizBundle(contentBase, bust);
    await Promise.all([subjectLoad, quizLoad]);

    // changelog は小さいので待つ（ベル表示用）。学習バックログは未使用のため読まない
    await loadOptionalScript(contentBase + "/changelog.js", bust);

    if (typeof SUBJECT === "undefined") throw new Error("SUBJECT が定義されていません");
    if (typeof QUIZ_DATA === "undefined") throw new Error("QUIZ_DATA が定義されていません");

    loadedId = id;
    currentId = id;
    setSelected(id);
    return { meta, subject: SUBJECT, contentBase, bust };
  }

  function getLoadedId() {
    return loadedId;
  }

  /**
   * 科目カード／マイページ用の軽量サマリ。
   * 問題 JS（数MB）は落とさず、カタログの問題数 + ローカル subject.js のみ使う。
   */
  async function loadSubjectSummary(id) {
    const meta = findMeta(id);
    if (!meta || !meta.enabled) throw new Error("科目が見つかりません: " + id);

    const localBase = meta.path.replace(/\/$/, "");
    const bust =
      typeof APP_VERSION !== "undefined" ? APP_VERSION : String(Date.now());
    const withBust = (url) => url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(bust);

    const res = await fetch(withBust(localBase + "/subject.js"), {
      cache: "force-cache",
      mode: "cors",
    });
    if (!res.ok) throw new Error("fetch failed: " + localBase + "/subject.js");
    const subjectCode = await res.text();
    const subject = new Function(
      subjectCode + "\n;return typeof SUBJECT!=='undefined'?SUBJECT:null;"
    )();
    if (!subject) throw new Error("SUBJECT が定義されていません");

    const catalog =
      typeof PricingConfig !== "undefined" && PricingConfig.SUBJECT_CATALOG
        ? PricingConfig.SUBJECT_CATALOG[id]
        : null;
    const questionTotal =
      (catalog && Number(catalog.questionCount)) ||
      Number(meta.questionCount) ||
      0;

    return {
      meta,
      subject,
      questionTotal,
      // null = 成績キーをすべて対象（問題マスタ未読込のため）
      validQuestionIds: null,
      // 入力カテゴリ ID はマスタ無しでは不明 → 段位の入力条件は控えめに見える
      inputQuestionIds: new Set(),
      lightweight: true,
    };
  }

  return {
    SELECTED_KEY,
    RESERVED_PATH_SEGMENTS,
    getSelected,
    setSelected,
    clearSelected,
    findMeta,
    getPathSubjectId,
    getUnknownPathSegment,
    resolveBootSubjectId,
    syncUrlForSubject,
    syncUrlForPicker,
    loadSubject,
    loadSubjectSummary,
    loadExtraScripts,
    getLoadedId,
    resolveContentBase,
  };
})();
