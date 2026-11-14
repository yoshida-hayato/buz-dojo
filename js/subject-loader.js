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

  // --- 検索エンジンに対する頁の身元 -------------------------------------
  // firebase.json の rewrites が全パスを index.html に送るので、既定では
  // /sap も /excel-functions も、綴りを間違えた /sapp も、トップページと
  // 同じ canonical と description を返す。クローラから見ると、同じ頁が
  // いくつもある状態になる。URL を書き換えるのは此処なので、頁の身元も
  // 此処で一緒に揃える。こうすれば canonical が URL とずれようがない。
  let metaDefaults = null;

  function rememberMetaDefaults() {
    if (metaDefaults) return metaDefaults;
    const pick = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getAttribute("content") || "" : "";
    };
    metaDefaults = {
      desc: pick('meta[name="description"]'),
      ogTitle: pick('meta[property="og:title"]'),
      ogDesc: pick('meta[property="og:description"]'),
    };
    return metaDefaults;
  }

  function setMetaContent(sel, value) {
    const el = document.querySelector(sel);
    if (el && value) el.setAttribute("content", value);
  }

  // id を渡せばその科目の頁、falsy ならトップページとして宣言する
  function syncPageMeta(id) {
    const base = rememberMetaDefaults();
    // レジストリに無い id は入口を持たない。トップページとして宣言する。
    const meta = id ? findMeta(id) : null;
    const link = document.getElementById("canonical-link");
    if (link) link.setAttribute("href", meta ? "/" + id : "/");
    let desc = String((meta && meta.description) || "").trim();
    if (!desc) {
      setMetaContent('meta[name="description"]', base.desc);
      setMetaContent('meta[property="og:title"]', base.ogTitle);
      setMetaContent('meta[property="og:description"]', base.ogDesc);
      return;
    }
    if (desc.length > 120) desc = desc.slice(0, 118) + "\u2026";
    setMetaContent('meta[name="description"]', desc);
    setMetaContent('meta[property="og:description"]', desc);
    setMetaContent(
      'meta[property="og:title"]',
      (meta.formalTitle || meta.title || "") + " — ビジネス道場"
    );
  }

  /** 科目ホーム等: `/sap` + 既存 search/hash に揃える */
  function syncUrlForSubject(id) {
    if (!id) return;
    syncPageMeta(id);
    if (!window.history || !window.history.replaceState) return;
    const wantPath = "/" + id;
    const cur = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (cur === wantPath) return;
    history.replaceState(null, "", wantPath + (location.search || "") + (location.hash || ""));
  }

  /** 科目ピッカー: `/` に戻す */
  function syncUrlForPicker() {
    syncPageMeta(null);
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

  // データだけの台本 (changelog / lesson / tcodes / abap-syntax) は、
  // script タグではなく取得して隔離した器で評価する。
  //
  // なぜか (2026-11-01 に Chromium で実測):
  //   これらはよその repo のマスタで、宣言の書き方がそろっていない。
  //   SAP の changelog.js は const CHANGELOG、学習道場の9科目は
  //   var CHANGELOG である。script タグで2度目を読むと
  //   Identifier CHANGELOG has already been declared で台本ごと落ちるのに、
  //   script の onload は成功として返るので、こちらは失敗に気づかない。
  //   しかも const は window の属性ではないため、clearGlobals の
  //   window.CHANGELOG = undefined が当たらない。結果、SAP を見たあとに
  //   別の科目へ移ると、ベルの更新履歴が SAP のまま残った。
  //   問題データ (loadQuizBundle) は既に同じ逃げ方をしている。
  const DATA_SCRIPT_GLOBALS = [
    "CHANGELOG",
    "LESSON_DATA",
    "TCODE_REF",
    "TCODE_MODULE_ORDER",
    "ABAP_SYNTAX_REF",
    "ABAP_SYNTAX_GROUP_ORDER",
  ];

  // 隔離して読む台本の名前。自前の subject.js だけが script タグで入る
  const DATA_SCRIPT_FILES = [
    "changelog.js",
    "lesson.js",
    "tcodes.js",
    "abap-syntax.js",
  ];

  // 同一ドメインに置いた問題データは、無くても 404 にならない。Firebase Hosting の
  // catch-all rewrite が 200 で index.html を返すので res.ok は真になり、その本文を
  // new Function に渡した瞬間に SyntaxError (Unexpected token の山かっこ) で落ちる。
  // 2026-11-09 に社長が本番で踏み (基本情報と応用情報の両方)、2026-11-14 に
  // 取得の口で /data/fe-kamoku-b/judgment-questions.js が頁そのものを返すことを
  // 実測した。マスタがよその repo に在る10科目は本物の 404 が返るので踏まない。
  // 見るのは本文の先頭だけにしてある。応答の型を条件に入れると、よその
  // マスタが型を間違えて配信していた場合に、動いていた科目を止めてしまう
  // (失敗の型13: よその repo の書き方がそろっていると思わないこと)。
  // JS の原文が山かっこで始まることは無いので、本文だけで足りる。
  // trim は先頭の見えない字 (BOM を含む) も落とすので、別に剥がす手は要らない
  // (2026-11-14 に実測。剥がす行を足したら、外しても誰も落ちなかった)。
  const HTML_FIRST_CHAR_CODE = 60;
  function looksLikeHtmlResponse(text) {
    const head = String(text || "").slice(0, 512).trim();
    return head.charCodeAt(0) === HTML_FIRST_CHAR_CODE;
  }

  function isDataScript(src) {
    const tail = String(src).split("?")[0].split("/").pop();
    return DATA_SCRIPT_FILES.indexOf(tail) !== -1;
  }

  function evalDataScript(text, names) {
    const picks = names
      .map((n) => n + ":typeof " + n + "!==" + "'undefined'" + "?" + n + ":undefined")
      .join(",");
    const nl = String.fromCharCode(10);
    return new Function(text + nl + ";return{" + picks + "};")();
  }

  async function loadDataScript(src, cacheBust, names) {
    const v = cacheBust || (typeof APP_VERSION !== "undefined" ? APP_VERSION : String(Date.now()));
    const url = src + (src.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(v);
    const res = await fetch(url, { cache: "force-cache", mode: "cors" });
    if (!res.ok) throw new Error("fetch failed: " + src);
    const body = await res.text();
    if (looksLikeHtmlResponse(body)) {
      throw new Error("JS ではなく頁が返りました: " + src);
    }
    const out = evalDataScript(body, names || DATA_SCRIPT_GLOBALS);
    (names || DATA_SCRIPT_GLOBALS).forEach((n) => {
      if (typeof out[n] !== "undefined") window[n] = out[n];
    });
    return out;
  }

  function loadScript(src, cacheBust) {
    if (isDataScript(src)) return loadDataScript(src, cacheBust, DATA_SCRIPT_GLOBALS);
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
    window.ORDER_DATA = undefined;
    window.CONTRAST_DATA = undefined;
    window.LEARNING_BACKLOG = undefined;
    DATA_SCRIPT_GLOBALS.forEach((n) => {
      window[n] = undefined;
    });
  }

  /**
   * judgment / order / contrast → questions.js の順で取得し、QUIZ_DATA を確定する。
   * マスタは const 宣言のため script タグ再注入だと再宣言エラー／科目切替失敗になる。
   * また questions.js 末尾が各追加データを連結するため、先にグローバルを用意する。
   * fetch + Function で同一スコープ評価し、window に載せる。
   */
  async function loadQuizBundle(contentBase, bust) {
    const withBust = (url) =>
      url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(bust);

    async function fetchText(src) {
      // ?v= 付きなら force-cache（マスタ更新時は version が変わる）
      const res = await fetch(withBust(src), { cache: "force-cache", mode: "cors" });
      if (!res.ok) throw new Error("fetch failed: " + src);
      const text = await res.text();
      if (looksLikeHtmlResponse(text)) {
        throw new Error("JS ではなく頁が返りました: " + src);
      }
      return text;
    }

    async function fetchOptional(src, fallback) {
      try {
        return await fetchText(src);
      } catch (e) {
        return fallback;
      }
    }

    // 評価は直列必須だが、ネットワーク取得は並列で短縮
    const [jSrc, oSrc, cSrc, qSrc] = await Promise.all([
      fetchOptional(contentBase + "/judgment-questions.js", "var JUDGMENT_DATA = [];"),
      fetchOptional(contentBase + "/order-questions.js", "var ORDER_DATA = [];"),
      fetchOptional(contentBase + "/contrast-questions.js", "var CONTRAST_DATA = [];"),
      fetchText(contentBase + "/questions.js"),
    ]);
    const bundle = new Function(
      jSrc +
        "\n" +
        oSrc +
        "\n" +
        cSrc +
        "\n" +
        qSrc +
        "\n;return{" +
        "quiz:typeof QUIZ_DATA!=='undefined'?QUIZ_DATA:[]," +
        "judgment:typeof JUDGMENT_DATA!=='undefined'?JUDGMENT_DATA:[]," +
        "order:typeof ORDER_DATA!=='undefined'?ORDER_DATA:[]," +
        "contrast:typeof CONTRAST_DATA!=='undefined'?CONTRAST_DATA:[]" +
        "};"
    )();

    const quiz = Array.isArray(bundle.quiz) ? bundle.quiz : [];
    if (!quiz.length) {
      throw new Error("問題データが空です: " + contentBase);
    }
    const judgment = Array.isArray(bundle.judgment) ? bundle.judgment : [];
    const order = Array.isArray(bundle.order) ? bundle.order : [];
    const contrast = Array.isArray(bundle.contrast) ? bundle.contrast : [];

    // questions.js の末尾は judgment / order / contrast を QUIZ_DATA に push する
    // 約束だが、その3行が無い科目がある (2026-10-11 実測: outlook-mail は
    // 本体72問 + 正誤28問、ai-ontology-intro は 本体48問 + 正誤12問。
    // teams-collab と excel-functions には3行がある)。
    // 出題プールは settings-ui.js の buildPool が QUIZ_DATA だけを見て作るので、
    // push が無い科目では「正誤問題」が1問も出ない。科目カードはカタログの
    // 件数 (100問 / 60問) を出すのに、ホームは「全72問」「全48問」と書く。
    // 取りこぼしをここで埋める。id で重複を外すので、既に push している科目では
    // 1問も増えない。問題データ側を直せない (別アプリのマスタ) ため読む側で揃える。
    const seenIds = new Set();
    for (const q of quiz) {
      if (q && q.id) seenIds.add(q.id);
    }
    for (const extra of [judgment, order, contrast]) {
      for (const q of extra) {
        if (!q || !q.id || seenIds.has(q.id)) continue;
        seenIds.add(q.id);
        quiz.push(q);
      }
    }

    window.QUIZ_DATA = quiz;
    window.JUDGMENT_DATA = judgment;
    window.ORDER_DATA = order;
    window.CONTRAST_DATA = contrast;
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
    await loadOptionalScript(contentBase + "/lesson.js", bust);

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
      typeof SubjectCatalog !== "undefined"
        ? { questionCount: SubjectCatalog.getQuestionCountSync(id) }
        : typeof PricingConfig !== "undefined" && PricingConfig.SUBJECT_CATALOG
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
    DATA_SCRIPT_GLOBALS,
    DATA_SCRIPT_FILES,
    isDataScript,
    evalDataScript,
    loadDataScript,
    clearGlobals,
    looksLikeHtmlResponse,
  };
})();
