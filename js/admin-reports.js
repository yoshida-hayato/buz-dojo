/**
 * 管理者ダッシュボード（admin/reports.html）
 * - 利用状況の集計（科目サブコレクション対応）
 * - 問題指摘（科目・指摘元フィルタ）
 * - サイト全体のお問い合わせ
 */
(function () {
  const $ = (id) => document.getElementById(id);

  /** @type {Map<string, object>} */
  const reportStore = new Map();
  /** @type {Map<string, object>} */
  const inquiryStore = new Map();
  /** @type {Map<string, object>} */
  const premiumStore = new Map();

  const INQUIRY_CATEGORIES = [
    { id: "general", label: "全般・ご意見" },
    { id: "bug", label: "不具合・表示の問題" },
    { id: "billing", label: "購入・課金・解約" },
    { id: "content", label: "問題集・学習内容について" },
    { id: "other", label: "その他" },
  ];

  const PREMIUM_TYPES = [
    { id: "feature", label: "機能要望" },
    { id: "content", label: "問題の追加・充実" },
    { id: "subject", label: "科目の追加案" },
  ];

  function firebaseReady() {
    return (
      typeof firebase !== "undefined" &&
      typeof FIREBASE_CONFIG !== "undefined" &&
      FIREBASE_CONFIG.apiKey
    );
  }

  function isAdminEmail(email) {
    if (!email || typeof REPORT_ADMIN_EMAILS === "undefined") return false;
    return REPORT_ADMIN_EMAILS.some(
      (e) => e && e.toLowerCase() === email.toLowerCase()
    );
  }

  function subjectTitle(id) {
    if (!id) return "（科目なし）";
    if (typeof SUBJECT_REGISTRY !== "undefined") {
      const hit = SUBJECT_REGISTRY.find((s) => s.id === id);
      if (hit) return hit.shortTitle || hit.title || id;
    }
    return id;
  }

  function fmtDate(ts) {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("ja-JP");
  }

  function pct(correct, answered) {
    if (!answered) return "—";
    return Math.round((correct / answered) * 100) + "%";
  }

  function masteredCount(qMap) {
    if (!qMap) return 0;
    return Object.values(qMap).filter((s) => {
      if (typeof s.ck === "number") return s.ck >= 2;
      return (s.k || 0) >= 2 && !(s.ia > 0);
    }).length;
  }

  function shortUid(uid) {
    if (!uid) return "—";
    return uid.length > 10 ? uid.slice(0, 8) + "…" : uid;
  }

  function showGate(text) {
    $("reports-gate").classList.remove("hidden");
    $("reports-main").classList.add("hidden");
    $("gate-message").textContent = text;
  }

  function showMain(user) {
    $("reports-gate").classList.add("hidden");
    $("reports-main").classList.remove("hidden");
    $("admin-user").textContent = user.email || user.uid;
  }

  function switchTab(tabId) {
    document.querySelectorAll(".admin-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tabId);
    });
    $("panel-analytics").classList.toggle("hidden", tabId !== "analytics");
    $("panel-reports").classList.toggle("hidden", tabId !== "reports");
    const xPanel = $("panel-x-schedule");
    if (xPanel) xPanel.classList.toggle("hidden", tabId !== "x-schedule");
    $("panel-inquiries").classList.toggle("hidden", tabId !== "inquiries");
    const premiumPanel = $("panel-premium");
    if (premiumPanel) premiumPanel.classList.toggle("hidden", tabId !== "premium");
    if (tabId === "x-schedule" && window.AdminXSchedule) {
      window.AdminXSchedule.onTabShow();
    }
  }

  function statCard(label, value, sub) {
    return (
      `<div class="analytics-stat">` +
      `<div class="analytics-stat-label">${escapeHtml(label)}</div>` +
      `<div class="analytics-stat-value">${escapeHtml(value)}</div>` +
      (sub ? `<div class="analytics-stat-sub">${escapeHtml(sub)}</div>` : "") +
      `</div>`
    );
  }

  function renderUsersTable(rows) {
    if (!rows.length) {
      return '<p class="reports-empty">成績ユーザがまだいません。</p>';
    }
    const head =
      '<table class="analytics-table">' +
      "<thead><tr>" +
      "<th>区分</th><th>ユーザ</th><th>回答</th><th>正解</th><th>正答率</th><th>習得</th><th>科目</th><th>最終利用</th>" +
      "</tr></thead><tbody>";
    const body = rows
      .map(
        (r) =>
          "<tr>" +
          `<td>${escapeHtml(r.kindLabel || "—")}</td>` +
          `<td>${escapeHtml(r.label)}</td>` +
          `<td>${r.answered}</td>` +
          `<td>${r.correct}</td>` +
          `<td>${pct(r.correct, r.answered)}</td>` +
          `<td>${r.mastered}</td>` +
          `<td>${escapeHtml(r.subjectsLabel || "—")}</td>` +
          `<td>${escapeHtml(r.lastActive)}</td>` +
          "</tr>"
      )
      .join("");
    return head + body + "</tbody></table>";
  }

  function masteredFromSubject(s) {
    const choice = Number(s.masteredChoice);
    if (!Number.isNaN(choice) && choice >= 0) return choice;
    return masteredCount(s.q);
  }

  function isOpenStatus(status) {
    const st = String(status || "open").toLowerCase();
    return st === "open" || st === "";
  }

  function reportMatchesFilters(r) {
    const subjectSel = ($("reports-filter-subject") || {}).value || "all";
    const reporterSel = ($("reports-filter-reporter") || {}).value || "all";
    const statusSel = ($("reports-filter-status") || {}).value || "all";

    if (subjectSel !== "all") {
      const sid = r.subjectId || "";
      if (subjectSel === "_none") {
        if (sid) return false;
      } else if (sid !== subjectSel) {
        return false;
      }
    }

    const fromAdmin = isAdminEmail(r.userEmail);
    if (reporterSel === "admin" && !fromAdmin) return false;
    if (reporterSel === "others" && fromAdmin) return false;

    const st = String(r.status || "open").toLowerCase();
    if (statusSel !== "all" && st !== statusSel) return false;

    return true;
  }

  function getFilteredReports() {
    return Array.from(reportStore.values()).filter(reportMatchesFilters);
  }

  function getOpenReportsFiltered() {
    return getFilteredReports().filter((r) => isOpenStatus(r.status));
  }

  function formatOpenReportsForChat(reports) {
    const now = new Date().toLocaleString("ja-JP");
    const lines = [
      "【未対応の問題指摘】" + reports.length + "件",
      "コピー日時: " + now,
      "依頼: 以下の未対応指摘をすべて確認し、問題データ・解説・形式を修正してデプロイまで完了してください。",
      "ルール: 「複数選択形式にした方がよい」は元問を削除し新IDで複数選択を追加。解説には可能なら操作・設定の目的も書く。",
      "",
    ];

    reports.forEach((r, i) => {
      const reasons =
        Array.isArray(r.reasonLabels) && r.reasonLabels.length
          ? r.reasonLabels.join(" / ")
          : "—";
      const reasonIds =
        Array.isArray(r.reasonIds) && r.reasonIds.length
          ? r.reasonIds.join(", ")
          : "—";
      const note = (r.note || "").trim();
      const message = (r.message || "").trim();
      let supplement = note;
      if (!supplement && message) supplement = message;
      else if (note && message && message !== note && !message.endsWith(note)) {
        supplement = message;
      }

      lines.push("========== " + (i + 1) + "/" + reports.length + " ==========");
      lines.push("status: open");
      lines.push("日時: " + (r.createdAtText || "—"));
      lines.push("科目: " + (r.subjectTitle || subjectTitle(r.subjectId) || "—"));
      lines.push("科目ID: " + (r.subjectId || "—"));
      lines.push("ID: " + (r.questionId || "—"));
      lines.push("分野: " + (r.questionModule || "—"));
      lines.push("カテゴリ: " + (r.questionCategory || "—"));
      lines.push("問題コード: " + (r.questionCode || "—"));
      lines.push("問題文: " + (r.questionText || "—"));
      lines.push("登録正解: " + (r.registeredAnswer || "—"));
      lines.push("ユーザ回答: " + (r.userAnswer || "—"));
      lines.push("結果: " + (r.wasCorrect ? "正解" : "不正解"));
      lines.push("指摘理由: " + reasons);
      lines.push("指摘理由ID: " + reasonIds);
      lines.push("補足: " + (supplement || "—"));
      lines.push(
        "ユーザ: " +
          (r.userEmail || "匿名") +
          (isAdminEmail(r.userEmail) ? "（管理者）" : "")
      );
      lines.push("版: v" + (r.appVersion || "—"));
      lines.push("");
    });

    return lines.join("\n").trim() + "\n";
  }

  function formatOpenInquiriesForChat(items) {
    const now = new Date().toLocaleString("ja-JP");
    const lines = [
      "【未対応のお問い合わせ】" + items.length + "件",
      "コピー日時: " + now,
      "依頼: 以下の未対応お問い合わせをすべて確認し、必要な対応・返信・修正を行ってください。",
      "",
    ];

    items.forEach((r, i) => {
      lines.push("========== " + (i + 1) + "/" + items.length + " ==========");
      lines.push("status: open");
      lines.push("日時: " + (r.createdAtText || "—"));
      lines.push("種別: " + (r.categoryLabel || "—"));
      lines.push("科目: " + (r.subjectTitle || subjectTitle(r.subjectId) || "—"));
      lines.push("科目ID: " + (r.subjectId || "—"));
      lines.push("ページ: " + (r.page || "—"));
      lines.push("内容: " + (r.message || "—"));
      lines.push("ユーザ: " + (r.userEmail || "匿名"));
      lines.push("版: v" + (r.appVersion || "—"));
      lines.push("");
    });

    return lines.join("\n").trim() + "\n";
  }

  function formatOpenPremiumForChat(items) {
    const now = new Date().toLocaleString("ja-JP");
    const lines = [
      "【未対応のプレミアム要望】" + items.length + "件",
      "コピー日時: " + now,
      "依頼: 以下の未対応要望をすべて確認し、対応可否・実装方針を検討してください。",
      "",
    ];

    items.forEach((r, i) => {
      lines.push("========== " + (i + 1) + "/" + items.length + " ==========");
      lines.push("status: open");
      lines.push("日時: " + (r.createdAtText || "—"));
      lines.push("種別: " + (r.typeLabel || "—"));
      lines.push("科目: " + (r.subjectTitle || subjectTitle(r.subjectId) || "—"));
      lines.push("科目ID: " + (r.subjectId || "—"));
      lines.push("要望内容: " + (r.message || "—"));
      lines.push("ユーザ: " + (r.userEmail || "—"));
      lines.push("版: v" + (r.appVersion || "—"));
      lines.push("");
    });

    return lines.join("\n").trim() + "\n";
  }

  async function bulkResolveItems({
    opens,
    collectionName,
    listEl,
    cardSelector,
    store,
    bulkBtn,
    bulkStatusEl,
    onDone,
  }) {
    if (!opens.length) return;
    bulkBtn.disabled = true;
    if (bulkStatusEl) {
      bulkStatusEl.classList.remove("hidden");
      bulkStatusEl.textContent = "更新中… 0/" + opens.length;
    }
    const CHUNK = 40;
    let done = 0;
    try {
      const db = firebase.firestore();
      for (let i = 0; i < opens.length; i += CHUNK) {
        const slice = opens.slice(i, i + CHUNK);
        const batch = db.batch();
        slice.forEach((r) => {
          batch.update(
            db.collection(collectionName).doc(r.docId),
            { status: "resolved" }
          );
        });
        await batch.commit();
        slice.forEach((r) => {
          const card = listEl.querySelector(
            cardSelector + '[data-id="' + r.docId + '"]'
          );
          if (card) {
            card.dataset.status = "resolved";
            const st = card.querySelector(".report-status");
            if (st) {
              st.textContent = "resolved";
              st.className = "report-status status-resolved";
            }
          }
          const stored = store.get(r.docId);
          if (stored) stored.status = "resolved";
        });
        done += slice.length;
        if (bulkStatusEl) {
          bulkStatusEl.textContent = "更新中… " + done + "/" + opens.length;
        }
      }
      if (bulkStatusEl) {
        bulkStatusEl.textContent =
          "完了: " + done + " 件を対応済にしました。";
      }
      if (onDone) await onDone();
    } catch (e) {
      if (bulkStatusEl) {
        bulkStatusEl.textContent =
          "エラー: " + (e && e.message ? e.message : String(e));
      }
      if (onDone) onDone();
    }
  }

  function wireBulkActions({
    copyBtn,
    bulkBtn,
    getOpens,
    formatForChat,
    copyStatusPrefix,
    confirmLabel,
    collectionName,
    listEl,
    cardSelector,
    store,
    onVisibilityRefresh,
    onAnalyticsRefresh,
  }) {
    if (copyBtn) {
      copyBtn.onclick = async () => {
        const opens = getOpens();
        if (!opens.length) return;
        try {
          await copyTextToClipboard(formatForChat(opens));
          setTabStatus(
            copyStatusPrefix,
            "copy",
            "コピーしました（" +
              opens.length +
              "件）。このチャットに貼り付けてください。"
          );
        } catch (e) {
          setTabStatus(
            copyStatusPrefix,
            "copy",
            "コピー失敗: " + (e && e.message ? e.message : String(e)),
            true
          );
        }
      };
    }

    if (bulkBtn) {
      bulkBtn.onclick = async () => {
        const opens = getOpens();
        if (!opens.length) return;
        if (
          !window.confirm(
            "表示中の未対応 " + opens.length + " 件をすべて「対応済」にします。よろしいですか？"
          )
        ) {
          return;
        }
        const bulkStatusEl = $(copyStatusPrefix + "-bulk-status");
        await bulkResolveItems({
          opens,
          collectionName,
          listEl,
          cardSelector,
          store,
          bulkBtn,
          bulkStatusEl,
          onDone: async () => {
            if (onVisibilityRefresh) onVisibilityRefresh();
            if (onAnalyticsRefresh) {
              try {
                await onAnalyticsRefresh();
              } catch (_) {
                /* ignore */
              }
            }
          },
        });
      };
    }
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (!ok) throw new Error("クリップボードへコピーできませんでした。");
  }

  function setCopyStatus(text, isError) {
    const el = $("reports-copy-status");
    if (!el) return;
    el.classList.remove("hidden");
    el.textContent = text;
    el.style.color = isError ? "var(--red)" : "var(--text-sub)";
  }

  function setTabStatus(prefix, kind, text, isError) {
    const el = $(prefix + "-" + kind + "-status");
    if (!el) return;
    el.classList.remove("hidden");
    el.textContent = text;
    el.style.color = isError ? "var(--red)" : "var(--text-sub)";
  }

  function clearTabStatus(prefix) {
    ["bulk", "copy"].forEach((kind) => {
      const el = $(prefix + "-" + kind + "-status");
      if (!el) return;
      el.classList.add("hidden");
      el.textContent = "";
    });
  }

  function fillSubjectFilter() {
    const sel = $("reports-filter-subject");
    if (!sel) return;
    const keep = sel.value || "all";
    sel.innerHTML = '<option value="all">すべて</option>';
    if (typeof SUBJECT_REGISTRY !== "undefined") {
      SUBJECT_REGISTRY.forEach((s) => {
        if (!s.enabled && s.enabled !== undefined) return;
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.shortTitle || s.title || s.id;
        sel.appendChild(opt);
      });
    }
    const none = document.createElement("option");
    none.value = "_none";
    none.textContent = "科目なし（旧データ）";
    sel.appendChild(none);
    sel.value = keep;
  }

  function fillInquiryCategoryFilter() {
    const sel = $("inquiries-filter-category");
    if (!sel) return;
    const keep = sel.value || "all";
    sel.innerHTML = '<option value="all">すべて</option>';
    INQUIRY_CATEGORIES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
    sel.value = keep;
  }

  async function fetchAllQuestionStats(db) {
    const subjects =
      typeof SUBJECT_REGISTRY !== "undefined"
        ? SUBJECT_REGISTRY.filter((s) => s.enabled !== false).map((s) => s.id)
        : ["sap", "windows-shortcuts", "biz-career"];
    const docs = [];
    const seen = new Set();

    await Promise.all(
      subjects.map(async (sid) => {
        const snap = await db
          .collection("questionStats")
          .doc(sid)
          .collection("questions")
          .get();
        snap.forEach((doc) => {
          seen.add(doc.id);
          docs.push({ id: doc.id, data: doc.data() || {} });
        });
      })
    );

    const legacySnap = await db.collection("questionStats").get();
    legacySnap.forEach((doc) => {
      if (seen.has(doc.id)) return;
      if (subjects.includes(doc.id)) return;
      const d = doc.data() || {};
      if (
        d.attempts !== undefined ||
        d.correct !== undefined ||
        d.inputAttempts !== undefined ||
        d.inputCorrect !== undefined
      ) {
        docs.push({ id: doc.id, data: d });
      }
    });

    return docs;
  }

  async function loadAnalytics(db) {
    $("analytics-summary").innerHTML =
      '<p class="reports-loading">集計中…</p>';
    $("analytics-users").innerHTML = "";

    const [usersSnap, anonSnap, statsDocs, reportsSnap, inquiriesSnap] =
      await Promise.all([
        db.collection("users").get(),
        db.collection("anonUsers").get().catch(() => ({ empty: true, forEach() {}, size: 0 })),
        fetchAllQuestionStats(db),
        db.collection("questionReports").get(),
        db.collection("siteInquiries").get(),
      ]);

    let totalAnswered = 0;
    let totalCorrect = 0;
    let activeUsers = 0;
    let activeAnon = 0;
    let totalMastered = 0;
    const userRows = [];

    async function accumulateUserDoc(doc, kindLabel) {
      const d = doc.data() || {};
      let answered = 0;
      let correct = 0;
      let mastered = 0;
      let lastActive = d.lastActiveAt || null;
      const subjectNames = [];
      let email = d.email || "";

      try {
        const subSnap = await doc.ref.collection("subjects").get();
        if (!subSnap.empty) {
          subSnap.forEach((sDoc) => {
            const s = sDoc.data() || {};
            answered += Number(s.answered) || 0;
            correct += Number(s.correct) || 0;
            mastered += masteredFromSubject(s);
            subjectNames.push(subjectTitle(sDoc.id));
            if (!email && s.email) email = s.email;
            if (s.lastActiveAt) {
              const t = s.lastActiveAt.toMillis ? s.lastActiveAt.toMillis() : 0;
              const cur = lastActive && lastActive.toMillis ? lastActive.toMillis() : 0;
              if (t > cur) lastActive = s.lastActiveAt;
            }
          });
        }
        // 科目サブコレが空／回答0のときはルート直下の旧形式も見る
        if (answered === 0 && (Number(d.answered) || 0) > 0) {
          answered = Number(d.answered) || 0;
          correct = Number(d.correct) || 0;
          mastered = Math.max(mastered, masteredCount(d.q));
        }
      } catch (err) {
        console.warn("ユーザ成績読込:", doc.id, err);
        answered = Number(d.answered) || 0;
        correct = Number(d.correct) || 0;
        mastered = masteredCount(d.q);
      }

      totalAnswered += answered;
      totalCorrect += correct;
      totalMastered += mastered;
      if (answered > 0) {
        if (kindLabel === "未ログイン") activeAnon += 1;
        else activeUsers += 1;
      }
      userRows.push({
        answered,
        correct,
        mastered,
        kindLabel,
        label:
          kindLabel === "未ログイン"
            ? "未ログイン (" + shortUid(doc.id) + ")"
            : email || shortUid(doc.id),
        subjectsLabel: subjectNames.length ? subjectNames.join("・") : "—",
        lastActive: fmtDate(lastActive),
      });
    }

    // users/{uid} ドキュメントが無く subjects だけあるケースがあるため collectionGroup も見る
    const userById = new Map();
    usersSnap.forEach((doc) => userById.set(doc.id, doc));

    try {
      const subjectGroup = await db.collectionGroup("subjects").get();
      subjectGroup.forEach((sDoc) => {
        const parent = sDoc.ref.parent && sDoc.ref.parent.parent;
        if (!parent) return;
        const path = parent.path || "";
        // users/{uid}/subjects/... のみ（anonUsers は別経路）
        if (!path.startsWith("users/")) return;
        const uid = parent.id;
        if (!userById.has(uid)) {
          userById.set(uid, {
            id: uid,
            ref: parent,
            data: () => ({}),
          });
        }
      });
    } catch (err) {
      console.warn("subjects collectionGroup:", err);
    }

    await Promise.all(
      Array.from(userById.values()).map((doc) => accumulateUserDoc(doc, "ログイン"))
    );

    const anonDocs = [];
    if (anonSnap && anonSnap.forEach) {
      anonSnap.forEach((doc) => anonDocs.push(doc));
    }
    await Promise.all(anonDocs.map((doc) => accumulateUserDoc(doc, "未ログイン")));

    userRows.sort((a, b) => b.answered - a.answered);

    let globalAttempts = 0;
    let globalCorrect = 0;
    let globalInputAttempts = 0;
    let globalInputCorrect = 0;
    let choiceQuestionCount = 0;
    let inputQuestionCount = 0;

    statsDocs.forEach((item) => {
      const d = item.data || {};
      const attempts = d.attempts || 0;
      const correct = d.correct || 0;
      const inputAttempts = d.inputAttempts || 0;
      const inputCorrect = d.inputCorrect || 0;
      if (attempts > 0) {
        globalAttempts += attempts;
        globalCorrect += correct;
        choiceQuestionCount += 1;
      }
      if (inputAttempts > 0) {
        globalInputAttempts += inputAttempts;
        globalInputCorrect += inputCorrect;
        inputQuestionCount += 1;
      }
    });

    let reportsOpen = 0;
    let reportsResolved = 0;
    let reportsDismissed = 0;
    reportsSnap.forEach((doc) => {
      const st = (doc.data().status || "open").toLowerCase();
      if (st === "resolved") reportsResolved += 1;
      else if (st === "dismissed") reportsDismissed += 1;
      else reportsOpen += 1;
    });

    let inqOpen = 0;
    let inqResolved = 0;
    let inqDismissed = 0;
    inquiriesSnap.forEach((doc) => {
      const st = (doc.data().status || "open").toLowerCase();
      if (st === "resolved") inqResolved += 1;
      else if (st === "dismissed") inqDismissed += 1;
      else inqOpen += 1;
    });

    $("analytics-summary").innerHTML =
      `<div class="analytics-stat-grid">` +
      statCard(
        "成績ユーザ",
        String(userById.size + anonDocs.length),
        `ログイン回答あり ${activeUsers} / 未ログイン回答あり ${activeAnon}`
      ) +
      statCard(
        "個人成績の累計回答",
        String(totalAnswered),
        `正解 ${totalCorrect}（${pct(totalCorrect, totalAnswered)}）※ユーザ別の合算`
      ) +
      statCard("習得問題（合計）", String(totalMastered), "全ユーザの k≥2 合算") +
      statCard(
        "みんなの選択式（延べ回答数）",
        String(globalAttempts),
        `問題ごとの attempts 合計 · 回答があった問題 ${choiceQuestionCount}問 · 正答率 ${pct(globalCorrect, globalAttempts)}`
      ) +
      statCard(
        "みんなの記述式（延べ回答数）",
        String(globalInputAttempts),
        `問題ごとの inputAttempts 合計 · 回答があった問題 ${inputQuestionCount}問 · 正答率 ${pct(globalInputCorrect, globalInputAttempts)}`
      ) +
      statCard(
        "問題指摘",
        String(reportsSnap.size),
        `未対応 ${reportsOpen} / 対応済 ${reportsResolved} / 却下 ${reportsDismissed}`
      ) +
      statCard(
        "お問い合わせ",
        String(inquiriesSnap.size),
        `未対応 ${inqOpen} / 対応済 ${inqResolved} / 却下 ${inqDismissed}`
      ) +
      `</div>`;

    $("analytics-users").innerHTML = renderUsersTable(userRows.slice(0, 50));
  }

  function refreshOpenCount() {
    const openCountEl = $("reports-open-count");
    const bulkBtn = $("reports-resolve-all-open");
    const copyBtn = $("reports-copy-open");
    const n = getOpenReportsFiltered().length;
    const shown = getFilteredReports().length;
    if (openCountEl) {
      openCountEl.textContent =
        "表示 " + shown + " / 未対応 " + n;
    }
    if (bulkBtn) {
      bulkBtn.disabled = n === 0;
      bulkBtn.textContent =
        n > 0
          ? "表示中の未対応 " + n + " 件を対応済にする"
          : "未対応を一括で対応済にする";
    }
    if (copyBtn) {
      copyBtn.disabled = n === 0;
      copyBtn.textContent =
        n > 0 ? "表示中の未対応 " + n + " 件をコピー" : "未対応を一括コピー";
    }
  }

  function applyReportVisibility() {
    const list = $("reports-list");
    if (!list) return;
    let visible = 0;
    list.querySelectorAll(".report-card").forEach((card) => {
      const stored = reportStore.get(card.dataset.id);
      const ok = stored && reportMatchesFilters(stored);
      card.classList.toggle("hidden", !ok);
      if (ok) visible += 1;
    });
    const empty = list.querySelector(".reports-filter-empty");
    if (empty) empty.remove();
    if (visible === 0 && reportStore.size > 0) {
      const p = document.createElement("p");
      p.className = "reports-empty reports-filter-empty";
      p.textContent = "フィルタに一致する指摘はありません。";
      list.appendChild(p);
    }
    refreshOpenCount();
  }

  async function loadReports(db) {
    const list = $("reports-list");
    const bulkBtn = $("reports-resolve-all-open");
    const copyBtn = $("reports-copy-open");
    const bulkStatus = $("reports-bulk-status");
    const copyStatus = $("reports-copy-status");
    list.innerHTML = '<p class="reports-loading">読み込み中…</p>';
    reportStore.clear();
    if (bulkBtn) bulkBtn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    if (bulkStatus) {
      bulkStatus.classList.add("hidden");
      bulkStatus.textContent = "";
    }
    if (copyStatus) {
      copyStatus.classList.add("hidden");
      copyStatus.textContent = "";
    }

    fillSubjectFilter();

    const snap = await db
      .collection("questionReports")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    if (snap.empty) {
      list.innerHTML = '<p class="reports-empty">指摘はまだありません。</p>';
      refreshOpenCount();
      return;
    }

    list.innerHTML = "";
    snap.forEach((doc) => {
      const r = doc.data();
      const status = (r.status || "open").toLowerCase();
      const fromAdmin = isAdminEmail(r.userEmail);
      const subId = r.subjectId || "";
      const subLabel = r.subjectTitle || subjectTitle(subId);

      reportStore.set(doc.id, {
        docId: doc.id,
        status: status || "open",
        createdAtText: fmtDate(r.createdAt),
        subjectId: subId,
        subjectTitle: subLabel,
        questionId: r.questionId || "",
        questionModule: r.questionModule || "",
        questionCategory: r.questionCategory || "",
        questionCode: r.questionCode || "",
        questionText: r.questionText || "",
        registeredAnswer: r.registeredAnswer || "",
        userAnswer: r.userAnswer || "",
        wasCorrect: !!r.wasCorrect,
        reasonLabels: Array.isArray(r.reasonLabels) ? r.reasonLabels.slice() : [],
        reasonIds: Array.isArray(r.reasonIds) ? r.reasonIds.slice() : [],
        message: r.message || "",
        note: r.note || "",
        userEmail: r.userEmail || "",
        appVersion: r.appVersion || "",
      });

      const card = document.createElement("article");
      card.className = "report-card card";
      card.dataset.id = doc.id;
      card.dataset.status = status || "open";
      card.innerHTML =
        `<div class="report-head">` +
        `<span class="report-status status-${escapeHtml(status || "open")}">${escapeHtml(status || "open")}</span>` +
        (fromAdmin
          ? `<span class="report-admin-badge">管理者指摘</span>`
          : "") +
        `<span class="report-date">${escapeHtml(fmtDate(r.createdAt))}</span>` +
        `</div>` +
        `<div class="report-meta">` +
        `<span><strong>科目</strong> ${escapeHtml(subLabel)}</span>` +
        `<span><strong>ID</strong> ${escapeHtml(r.questionId)}</span>` +
        `<span><strong>分野</strong> ${escapeHtml(r.questionModule || "—")}</span>` +
        `<span><strong>カテゴリ</strong> ${escapeHtml(r.questionCategory || "—")}</span>` +
        `</div>` +
        `<div class="report-q">${escapeHtml(r.questionText || r.questionCode || "—")}</div>` +
        `<div class="report-answers">` +
        `<div><span class="ra-label">登録正解</span> ${escapeHtml(r.registeredAnswer || "—")}</div>` +
        `<div><span class="ra-label">ユーザ回答</span> ${escapeHtml(r.userAnswer || "—")}</div>` +
        `<div><span class="ra-label">結果</span> ${r.wasCorrect ? "正解" : "不正解"}</div>` +
        `</div>` +
        (Array.isArray(r.reasonLabels) && r.reasonLabels.length
          ? `<div class="report-reasons">${r.reasonLabels.map((l) => `<span class="report-reason-tag">${escapeHtml(l)}</span>`).join("")}</div>`
          : "") +
        `<div class="report-message">${escapeHtml(r.message || "")}</div>` +
        `<div class="report-foot">` +
        `<span>${escapeHtml(r.userEmail || "匿名")}${fromAdmin ? "（管理者）" : ""}</span>` +
        `<span>v${escapeHtml(r.appVersion || "—")}</span>` +
        `<div class="report-actions">` +
        `<button type="button" class="link-btn" data-action="resolved">対応済</button>` +
        `<button type="button" class="link-btn" data-action="dismissed">却下</button>` +
        `</div>` +
        `</div>`;

      card.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const next = btn.getAttribute("data-action");
          await db.collection("questionReports").doc(doc.id).update({ status: next });
          card.dataset.status = next;
          card.querySelector(".report-status").textContent = next;
          card.querySelector(".report-status").className =
            "report-status status-" + next;
          const stored = reportStore.get(doc.id);
          if (stored) stored.status = next;
          applyReportVisibility();
        });
      });

      list.appendChild(card);
    });

    applyReportVisibility();

    if (copyBtn) {
      copyBtn.onclick = async () => {
        const opens = getOpenReportsFiltered();
        if (!opens.length) return;
        try {
          const text = formatOpenReportsForChat(opens);
          await copyTextToClipboard(text);
          setCopyStatus(
            "コピーしました（" +
              opens.length +
              "件）。このチャットに貼り付けてください。"
          );
        } catch (e) {
          setCopyStatus(
            "コピー失敗: " + (e && e.message ? e.message : String(e)),
            true
          );
        }
      };
    }

    if (bulkBtn) {
      bulkBtn.onclick = async () => {
        const opens = getOpenReportsFiltered();
        if (!opens.length) return;
        if (
          !window.confirm(
            "表示中の未対応指摘 " +
              opens.length +
              " 件をすべて「対応済」にします。よろしいですか？"
          )
        ) {
          return;
        }
        bulkBtn.disabled = true;
        if (bulkStatus) {
          bulkStatus.classList.remove("hidden");
          bulkStatus.textContent = "更新中… 0/" + opens.length;
        }
        const CHUNK = 40;
        let done = 0;
        try {
          for (let i = 0; i < opens.length; i += CHUNK) {
            const slice = opens.slice(i, i + CHUNK);
            const batch = db.batch();
            slice.forEach((r) => {
              batch.update(
                db.collection("questionReports").doc(r.docId),
                { status: "resolved" }
              );
            });
            await batch.commit();
            slice.forEach((r) => {
              const card = list.querySelector(
                '.report-card[data-id="' + r.docId + '"]'
              );
              if (card) {
                card.dataset.status = "resolved";
                const st = card.querySelector(".report-status");
                if (st) {
                  st.textContent = "resolved";
                  st.className = "report-status status-resolved";
                }
              }
              const stored = reportStore.get(r.docId);
              if (stored) stored.status = "resolved";
            });
            done += slice.length;
            if (bulkStatus) {
              bulkStatus.textContent = "更新中… " + done + "/" + opens.length;
            }
          }
          if (bulkStatus) {
            bulkStatus.textContent =
              "完了: " + done + " 件を対応済にしました。";
          }
          applyReportVisibility();
          try {
            await loadAnalytics(db);
          } catch (_) {
            /* ignore */
          }
        } catch (e) {
          if (bulkStatus) {
            bulkStatus.textContent =
              "エラー: " + (e && e.message ? e.message : String(e));
          }
          applyReportVisibility();
        }
      };
    }
  }

  function inquiryMatchesFilters(r) {
    const statusSel = ($("inquiries-filter-status") || {}).value || "all";
    const catSel = ($("inquiries-filter-category") || {}).value || "all";
    const st = String(r.status || "open").toLowerCase();
    if (statusSel !== "all" && st !== statusSel) return false;
    if (catSel !== "all" && (r.category || "other") !== catSel) return false;
    return true;
  }

  function getFilteredInquiries() {
    return Array.from(inquiryStore.values()).filter(inquiryMatchesFilters);
  }

  function getOpenInquiriesFiltered() {
    return getFilteredInquiries().filter((r) => isOpenStatus(r.status));
  }

  function refreshInquiryOpenCount() {
    const openCountEl = $("inquiries-open-count");
    const bulkBtn = $("inquiries-resolve-all-open");
    const copyBtn = $("inquiries-copy-open");
    const filtered = getFilteredInquiries();
    const n = getOpenInquiriesFiltered().length;
    if (openCountEl) {
      openCountEl.textContent = "表示 " + filtered.length + " / 未対応 " + n;
    }
    if (bulkBtn) {
      bulkBtn.disabled = n === 0;
      bulkBtn.textContent =
        n > 0
          ? "表示中の未対応 " + n + " 件を対応済にする"
          : "未対応を一括で対応済にする";
    }
    if (copyBtn) {
      copyBtn.disabled = n === 0;
      copyBtn.textContent =
        n > 0 ? "表示中の未対応 " + n + " 件をコピー" : "未対応を一括コピー";
    }
  }

  function applyInquiryVisibility() {
    const list = $("inquiries-list");
    if (!list) return;
    let visible = 0;
    list.querySelectorAll(".inquiry-card").forEach((card) => {
      const stored = inquiryStore.get(card.dataset.id);
      const ok = stored && inquiryMatchesFilters(stored);
      card.classList.toggle("hidden", !ok);
      if (ok) visible += 1;
    });
    const empty = list.querySelector(".inquiries-filter-empty");
    if (empty) empty.remove();
    if (visible === 0 && inquiryStore.size > 0) {
      const p = document.createElement("p");
      p.className = "reports-empty inquiries-filter-empty";
      p.textContent = "フィルタに一致するお問い合わせはありません。";
      list.appendChild(p);
    }
    refreshInquiryOpenCount();
  }

  async function loadInquiries(db) {
    const list = $("inquiries-list");
    const bulkBtn = $("inquiries-resolve-all-open");
    const copyBtn = $("inquiries-copy-open");
    list.innerHTML = '<p class="reports-loading">読み込み中…</p>';
    inquiryStore.clear();
    clearTabStatus("inquiries");
    if (bulkBtn) bulkBtn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    fillInquiryCategoryFilter();

    const snap = await db
      .collection("siteInquiries")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    if (snap.empty) {
      list.innerHTML =
        '<p class="reports-empty">お問い合わせはまだありません。</p>';
      refreshInquiryOpenCount();
      return;
    }

    list.innerHTML = "";
    snap.forEach((doc) => {
      const r = doc.data();
      const status = (r.status || "open").toLowerCase();
      const catLabel =
        r.categoryLabel ||
        (INQUIRY_CATEGORIES.find((c) => c.id === r.category) || {}).label ||
        r.category ||
        "—";

      inquiryStore.set(doc.id, {
        docId: doc.id,
        status: status || "open",
        category: r.category || "other",
        categoryLabel: catLabel,
        message: r.message || "",
        userEmail: r.userEmail || "",
        subjectId: r.subjectId || "",
        subjectTitle: r.subjectTitle || "",
        page: r.page || "",
        appVersion: r.appVersion || "",
        createdAtText: fmtDate(r.createdAt),
      });

      const card = document.createElement("article");
      card.className = "inquiry-card report-card card";
      card.dataset.id = doc.id;
      card.dataset.status = status || "open";
      card.innerHTML =
        `<div class="report-head">` +
        `<span class="report-status status-${escapeHtml(status || "open")}">${escapeHtml(status || "open")}</span>` +
        `<span class="report-reason-tag">${escapeHtml(catLabel)}</span>` +
        `<span class="report-date">${escapeHtml(fmtDate(r.createdAt))}</span>` +
        `</div>` +
        `<div class="report-meta">` +
        (r.subjectId || r.subjectTitle
          ? `<span><strong>開いていた科目</strong> ${escapeHtml(r.subjectTitle || subjectTitle(r.subjectId))}</span>`
          : "") +
        (r.page
          ? `<span><strong>ページ</strong> ${escapeHtml(r.page)}</span>`
          : "") +
        `</div>` +
        `<div class="report-message">${escapeHtml(r.message || "")}</div>` +
        `<div class="report-foot">` +
        `<span>${escapeHtml(r.userEmail || "匿名")}</span>` +
        `<span>v${escapeHtml(r.appVersion || "—")}</span>` +
        `<div class="report-actions">` +
        `<button type="button" class="link-btn" data-action="resolved">対応済</button>` +
        `<button type="button" class="link-btn" data-action="dismissed">却下</button>` +
        `</div>` +
        `</div>`;

      card.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const next = btn.getAttribute("data-action");
          await db.collection("siteInquiries").doc(doc.id).update({ status: next });
          card.dataset.status = next;
          card.querySelector(".report-status").textContent = next;
          card.querySelector(".report-status").className =
            "report-status status-" + next;
          const stored = inquiryStore.get(doc.id);
          if (stored) stored.status = next;
          applyInquiryVisibility();
        });
      });

      list.appendChild(card);
    });

    applyInquiryVisibility();

    wireBulkActions({
      copyBtn,
      bulkBtn,
      getOpens: getOpenInquiriesFiltered,
      formatForChat: formatOpenInquiriesForChat,
      copyStatusPrefix: "inquiries",
      collectionName: "siteInquiries",
      listEl: list,
      cardSelector: ".inquiry-card",
      store: inquiryStore,
      onVisibilityRefresh: applyInquiryVisibility,
      onAnalyticsRefresh: () => loadAnalytics(db),
    });
  }

  function getFilteredPremium() {
    return Array.from(premiumStore.values()).filter(premiumMatchesFilters);
  }

  function getOpenPremiumFiltered() {
    return getFilteredPremium().filter((r) => isOpenStatus(r.status));
  }

  function refreshPremiumOpenCount() {
    const openCountEl = $("premium-open-count");
    const bulkBtn = $("premium-resolve-all-open");
    const copyBtn = $("premium-copy-open");
    const filtered = getFilteredPremium();
    const n = getOpenPremiumFiltered().length;
    if (openCountEl) {
      openCountEl.textContent = "表示 " + filtered.length + " / 未対応 " + n;
    }
    if (bulkBtn) {
      bulkBtn.disabled = n === 0;
      bulkBtn.textContent =
        n > 0
          ? "表示中の未対応 " + n + " 件を対応済にする"
          : "未対応を一括で対応済にする";
    }
    if (copyBtn) {
      copyBtn.disabled = n === 0;
      copyBtn.textContent =
        n > 0 ? "表示中の未対応 " + n + " 件をコピー" : "未対応を一括コピー";
    }
  }

  function premiumMatchesFilters(r) {
    const statusSel = ($("premium-filter-status") || {}).value || "all";
    const typeSel = ($("premium-filter-type") || {}).value || "all";
    const st = String(r.status || "open").toLowerCase();
    if (statusSel !== "all" && st !== statusSel) return false;
    if (typeSel !== "all" && (r.type || "feature") !== typeSel) return false;
    return true;
  }

  function applyPremiumVisibility() {
    const list = $("premium-list");
    if (!list) return;
    let visible = 0;
    list.querySelectorAll(".premium-card").forEach((card) => {
      const stored = premiumStore.get(card.dataset.id);
      const ok = stored && premiumMatchesFilters(stored);
      card.classList.toggle("hidden", !ok);
      if (ok) visible += 1;
    });
    const empty = list.querySelector(".premium-filter-empty");
    if (empty) empty.remove();
    if (visible === 0 && premiumStore.size > 0) {
      const p = document.createElement("p");
      p.className = "reports-empty premium-filter-empty";
      p.textContent = "フィルタに一致する要望はありません。";
      list.appendChild(p);
    }
    refreshPremiumOpenCount();
  }

  function fillPremiumTypeFilter() {
    const sel = $("premium-filter-type");
    if (!sel || sel.options.length > 1) return;
    PREMIUM_TYPES.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      sel.appendChild(opt);
    });
  }

  async function loadPremiumRequests(db) {
    const list = $("premium-list");
    if (!list) return;
    const bulkBtn = $("premium-resolve-all-open");
    const copyBtn = $("premium-copy-open");
    list.innerHTML = '<p class="reports-loading">読み込み中…</p>';
    premiumStore.clear();
    clearTabStatus("premium");
    if (bulkBtn) bulkBtn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    fillPremiumTypeFilter();

    const snap = await db
      .collection("premiumRequests")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    if (snap.empty) {
      list.innerHTML = '<p class="reports-empty">プレミアム要望はまだありません。</p>';
      refreshPremiumOpenCount();
      return;
    }

    list.innerHTML = "";
    snap.forEach((doc) => {
      const r = doc.data();
      const status = (r.status || "open").toLowerCase();
      const typeLabel =
        r.typeLabel ||
        (PREMIUM_TYPES.find((t) => t.id === r.type) || {}).label ||
        r.type ||
        "—";

      premiumStore.set(doc.id, {
        docId: doc.id,
        status: status || "open",
        type: r.type || "feature",
        typeLabel,
        message: r.message || "",
        userEmail: r.userEmail || "",
        subjectId: r.subjectId || "",
        subjectTitle: r.subjectTitle || "",
        appVersion: r.appVersion || "",
        createdAtText: fmtDate(r.createdAt),
      });

      const card = document.createElement("article");
      card.className = "premium-card report-card card";
      card.dataset.id = doc.id;
      card.dataset.status = status || "open";
      card.innerHTML =
        `<div class="report-head">` +
        `<span class="report-status status-${escapeHtml(status || "open")}">${escapeHtml(status || "open")}</span>` +
        `<span class="report-reason-tag">${escapeHtml(typeLabel)}</span>` +
        `<span class="report-date">${escapeHtml(fmtDate(r.createdAt))}</span>` +
        `</div>` +
        `<div class="report-meta">` +
        (r.subjectId || r.subjectTitle
          ? `<span><strong>科目</strong> ${escapeHtml(r.subjectTitle || subjectTitle(r.subjectId))}</span>`
          : "") +
        `</div>` +
        `<pre class="report-message premium-message">${escapeHtml(r.message || "")}</pre>` +
        `<div class="report-foot">` +
        `<span>${escapeHtml(r.userEmail || "—")}</span>` +
        `<span>v${escapeHtml(r.appVersion || "—")}</span>` +
        `<div class="report-actions">` +
        `<button type="button" class="link-btn" data-action="resolved">対応済</button>` +
        `<button type="button" class="link-btn" data-action="dismissed">却下</button>` +
        `</div>` +
        `</div>`;

      card.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const next = btn.getAttribute("data-action");
          await db.collection("premiumRequests").doc(doc.id).update({ status: next });
          card.dataset.status = next;
          card.querySelector(".report-status").textContent = next;
          card.querySelector(".report-status").className =
            "report-status status-" + next;
          const stored = premiumStore.get(doc.id);
          if (stored) stored.status = next;
          applyPremiumVisibility();
        });
      });

      list.appendChild(card);
    });

    applyPremiumVisibility();

    wireBulkActions({
      copyBtn,
      bulkBtn,
      getOpens: getOpenPremiumFiltered,
      formatForChat: formatOpenPremiumForChat,
      copyStatusPrefix: "premium",
      collectionName: "premiumRequests",
      listEl: list,
      cardSelector: ".premium-card",
      store: premiumStore,
      onVisibilityRefresh: applyPremiumVisibility,
      onAnalyticsRefresh: () => loadAnalytics(db),
    });
  }

  function boot() {
    if (!firebaseReady()) {
      showGate("Firebase が未設定です。");
      return;
    }

    if (
      typeof REPORT_ADMIN_EMAILS === "undefined" ||
      !REPORT_ADMIN_EMAILS.length
    ) {
      showGate(
        "管理者メールが未設定です。config/admin-config.js の REPORT_ADMIN_EMAILS と firestore.rules を設定してください。"
      );
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    document.querySelectorAll(".admin-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.getAttribute("data-tab"));
      });
    });

    ["reports-filter-subject", "reports-filter-reporter", "reports-filter-status"].forEach(
      (id) => {
        const el = $(id);
        if (el) el.addEventListener("change", applyReportVisibility);
      }
    );
    ["inquiries-filter-status", "inquiries-filter-category"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", applyInquiryVisibility);
    });
    ["premium-filter-status", "premium-filter-type"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", applyPremiumVisibility);
    });

    $("admin-login-btn").addEventListener("click", () => {
      const email = $("admin-email").value.trim();
      const password = $("admin-password").value;
      auth.signInWithEmailAndPassword(email, password).catch((e) => {
        $("gate-message").textContent = e.message;
      });
    });

    $("admin-logout-btn").addEventListener("click", () => auth.signOut());

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        showGate("管理者としてログインしてください。");
        return;
      }
      if (!isAdminEmail(user.email)) {
        showGate(
          "このアカウント（" +
            user.email +
            "）は管理者として登録されていません。"
        );
        auth.signOut();
        return;
      }
      showMain(user);
      $("admin-logout-btn").classList.remove("hidden");
      if (window.AdminXSchedule) window.AdminXSchedule.init(auth);
      try {
        // 再合算バグで4倍になった questionStats を ÷4（サーバ側で1回限り）
        try {
          const repair = firebase
            .app()
            .functions("asia-northeast1")
            .httpsCallable("repairQuestionStatsQuadruple");
          const repaired = await repair({});
          if (repaired && repaired.data && repaired.data.fixed) {
            console.info("questionStats を ÷4 修復:", repaired.data);
          }
        } catch (repairErr) {
          console.warn("questionStats 修復スキップ:", repairErr);
        }
        await Promise.all([
          loadAnalytics(db),
          loadReports(db),
          loadInquiries(db),
          loadPremiumRequests(db),
        ]);
      } catch (e) {
        $("analytics-summary").innerHTML =
          '<p class="reports-error">集計エラー: ' +
          escapeHtml(e.message) +
          "（firestore.rules の isReportAdmin と users の read 権限を確認）</p>";
        $("reports-list").innerHTML =
          '<p class="reports-error">読み込みエラー: ' +
          escapeHtml(e.message) +
          "</p>";
        $("inquiries-list").innerHTML =
          '<p class="reports-error">読み込みエラー: ' +
          escapeHtml(e.message) +
          "</p>";
        if ($("premium-list")) {
          $("premium-list").innerHTML =
            '<p class="reports-error">読み込みエラー: ' +
            escapeHtml(e.message) +
            "</p>";
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
