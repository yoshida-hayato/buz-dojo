/**
 * 管理者: X（Twitter）投稿予定一覧（1週間）
 */
(function () {
  const $ = (id) => document.getElementById(id);
  let scheduleFn = null;
  let overrideFn = null;
  let loaded = false;

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusLabel(status) {
    if (status === "posted") return "投稿済";
    if (status === "pinned" || status === "override") return "確定";
    return "予定";
  }

  function statusClass(status) {
    if (status === "posted") return "xsched-status-posted";
    if (status === "pinned" || status === "override") return "xsched-status-override";
    return "xsched-status-scheduled";
  }

  function renderChoices(day) {
    const labels = ["A", "B", "C", "D", "E", "F"];
    if (Array.isArray(day.abbrParts) && day.abbrParts.length) {
      return (
        '<div class="xsched-abbr-parts">' +
        day.abbrParts
          .map((part) => {
            const correctIdx = (part.choices || []).findIndex(
              (c) => String(c) === String(part.answer)
            );
            const correctLabel = correctIdx >= 0 ? labels[correctIdx] : "—";
            const items = (part.choices || [])
              .map((c, i) => {
                const mark = i === correctIdx ? ' <span class="xsched-correct">← 正解</span>' : "";
                return `<li><strong>${labels[i]}.</strong> ${escapeHtml(c)}${mark}</li>`;
              })
              .join("");
            return (
              `<div class="xsched-abbr-part">` +
              `<div class="xsched-abbr-part-title">` +
              (part.isConnector
                ? `接続語 <span class="xsched-muted">（${escapeHtml(part.answer)}）</span>`
                : escapeHtml(part.badge || part.letter || "")) +
              ` <span class="xsched-muted">（正解 ${escapeHtml(correctLabel)}）</span></div>` +
              `<ul class="xsched-choices">${items}</ul>` +
              `</div>`
            );
          })
          .join("") +
        "</div>"
      );
    }
    if (!Array.isArray(day.choices) || !day.choices.length) {
      return '<p class="xsched-muted">選択肢なし</p>';
    }
    const multiLabels = Array.isArray(day.answerLabels) ? day.answerLabels : [];
    return (
      '<ul class="xsched-choices">' +
      day.choices
        .map((c, i) => {
          const isCorrect = multiLabels.length
            ? multiLabels.includes(labels[i])
            : day.answerLabel === labels[i] || String(c) === String(day.answer);
          const mark = isCorrect ? ' <span class="xsched-correct">← 正解</span>' : "";
          return `<li><strong>${labels[i]}.</strong> ${escapeHtml(c)}${mark}</li>`;
        })
        .join("") +
      "</ul>"
    );
  }

  function renderReplyPreview(day) {
    if (!day.replyText) return "";
    const weight = Number(day.replyWeight) || 0;
    const maxW = Number(day.replyMaxWeight) || 270;
    const ratio = Math.min(100, Math.round((weight / maxW) * 100));
    const barClass =
      weight > maxW ? "xsched-reply-bar-over" : weight > maxW * 0.9 ? "xsched-reply-bar-warn" : "";
    let note = "";
    if (day.replyExplanationTruncated) {
      note = '<p class="xsched-reply-note xsched-reply-note-warn">解説は文字数制限により末尾が「…」で省略されています（実際の投稿と同じ）</p>';
    } else if (day.replyExplanationOmitted) {
      note = '<p class="xsched-reply-note xsched-reply-note-warn">解説は文字数制限のため投稿に含まれません（実際の投稿と同じ）</p>';
    }
    return (
      `<div class="xsched-reply-preview">` +
      `<div class="xsched-reply-head">` +
      `<strong>X返信（投稿時の本文）</strong>` +
      `<span class="xsched-reply-weight ${barClass}">X換算 ${weight} / ${maxW} 文字</span>` +
      `</div>` +
      `<div class="xsched-reply-bar-wrap" aria-hidden="true">` +
      `<div class="xsched-reply-bar ${barClass}" style="width:${ratio}%"></div>` +
      `</div>` +
      note +
      `<pre class="xsched-reply-text">${escapeHtml(day.replyText)}</pre>` +
      `</div>`
    );
  }

  function renderImagePreview(day) {
    if (!day.imageBase64) return "";
    const label = day.layoutLabel || day.visualType || "";
    return (
      `<div class="xsched-preview">` +
      (label ? `<span class="xsched-layout-badge">${escapeHtml(label)}</span>` : "") +
      `<img src="data:image/png;base64,${day.imageBase64}" alt="X投稿画像プレビュー" loading="lazy" />` +
      `</div>`
    );
  }

  function renderLayoutSamples(samples) {
    if (!Array.isArray(samples) || !samples.length) return "";
    return (
      `<section class="card xsched-samples">` +
      `<h3 class="card-subtitle">画像レイアウトの種類（サンプル）</h3>` +
      `<p class="modal-note">問題の種類ごとに投稿画像のデザインが変わります。修正指摘時はこの見た目も参考にしてください。</p>` +
      `<div class="xsched-sample-grid">` +
      samples
        .map(
          (s) =>
            `<figure class="xsched-sample-card">` +
            `<figcaption>` +
            `<strong>${escapeHtml(s.layoutLabel || s.visualType)}</strong>` +
            `<span>${escapeHtml(s.categoryLabel || "")}</span>` +
            `<code>${escapeHtml(s.questionId || "")}</code>` +
            `</figcaption>` +
            (s.imageBase64
              ? `<img src="data:image/png;base64,${s.imageBase64}" alt="${escapeHtml(s.layoutLabel || "")}" loading="lazy" />`
              : "") +
            `</figure>`
        )
        .join("") +
      `</div></section>`
    );
  }

  function renderDayCard(day) {
    const editable = day.status !== "posted";
    const overrideNote =
      day.override && day.override.note
        ? `<p class="xsched-override-note">メモ: ${escapeHtml(day.override.note)}</p>`
        : "";
    const tweetLink = day.tweetUrl
      ? `<a class="link-btn" href="${escapeHtml(day.tweetUrl)}" target="_blank" rel="noopener">Xで見る</a>`
      : "";

    return (
      `<article class="xsched-card card" data-date="${escapeHtml(day.date)}">` +
      `<div class="xsched-head">` +
      `<div>` +
      `<div class="xsched-date">${escapeHtml(day.dateLabel)} <span class="xsched-time">${escapeHtml(day.postAt)}</span></div>` +
      `<div class="xsched-meta">` +
      `<span class="xsched-status ${statusClass(day.status)}">${escapeHtml(statusLabel(day.status))}</span>` +
      `<span>#${escapeHtml(String(day.seq))}</span>` +
      `<span>${escapeHtml(day.categoryLabel || day.category || "")}</span>` +
      `<span>${escapeHtml(day.moduleLabel || day.module || "")}</span>` +
      `</div>` +
      `</div>` +
      `<div class="xsched-head-actions">` +
      tweetLink +
      `</div>` +
      `</div>` +
      `<p class="xsched-qid"><code>${escapeHtml(day.questionId || "—")}</code>` +
      (day.layoutLabel ? ` <span class="xsched-layout-inline">${escapeHtml(day.layoutLabel)}</span>` : "") +
      `</p>` +
      renderImagePreview(day) +
      `<p class="xsched-question">${escapeHtml(day.question || "（問題を取得できませんでした）")}</p>` +
      renderChoices(day) +
      renderReplyPreview(day) +
      (day.explanation
        ? `<details class="xsched-details"><summary>解説</summary><p>${escapeHtml(day.explanation)}</p></details>`
        : "") +
      overrideNote +
      `<div class="xsched-actions">` +
      `<button type="button" class="secondary-btn" data-action="copy-id" data-id="${escapeHtml(day.questionId || "")}">IDをコピー</button>` +
      `<button type="button" class="secondary-btn" data-action="copy-fix" data-date="${escapeHtml(day.date)}">修正依頼文をコピー</button>` +
      (editable
        ? `<button type="button" class="secondary-btn" data-action="repick" data-date="${escapeHtml(day.date)}">別問題に差し替え</button>` +
          `<button type="button" class="secondary-btn" data-action="set-id" data-date="${escapeHtml(day.date)}">IDを指定</button>`
        : "") +
      `</div>` +
      `</article>`
    );
  }

  function formatFixRequest(day) {
    const labels = ["A", "B", "C", "D"];
    const choiceLines = (day.choices || [])
      .map((c, i) => `${labels[i]}. ${c}`)
      .join("\n");
    return [
      "【X投稿予定の問題修正依頼】",
      `投稿日: ${day.date}（${day.dateLabel}）`,
      `問題ID: ${day.questionId}`,
      `カテゴリ: ${day.categoryLabel} / ${day.moduleLabel}`,
      "",
      "問題文:",
      day.question || "",
      "",
      "選択肢:",
      choiceLines,
      "",
      `正解: ${day.answerLabel || day.answer || "—"}`,
      "",
      "X返信（投稿時）:",
      day.replyText || "—",
      day.replyWeight != null
        ? `（X換算 ${day.replyWeight} / ${day.replyMaxWeight || 270} 文字）`
        : "",
      "",
      "解説:",
      day.explanation || "",
      "",
      "修正内容:",
      "（ここに記入）",
      "",
      "画像レイアウト: " + (day.layoutLabel || day.visualType || "標準"),
    ].join("\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function loadSchedule() {
    const list = $("xsched-list");
    const status = $("xsched-status");
    if (!list || !scheduleFn) return;
    list.innerHTML = '<p class="reports-loading">読み込み中…（画像生成に10〜30秒かかることがあります）</p>';
    if (status) status.textContent = "";
    try {
      const res = await scheduleFn({ days: 7 });
      const data = res.data || {};
      if (!data.ok || !Array.isArray(data.days)) {
        throw new Error("予定データの形式が不正です");
      }
      if (status) {
        status.textContent =
          `通算 #${data.seq} ・ 本日${data.todayPosted ? "は投稿済" : "は未投稿"} ・ 候補プール ${data.poolSize} 問`;
      }
      list.innerHTML =
        (data.layoutSamples ? renderLayoutSamples(data.layoutSamples) : "") +
        data.days.map(renderDayCard).join("");
      list.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => handleAction(btn, data.days));
      });
      loaded = true;
    } catch (err) {
      list.innerHTML =
        '<p class="reports-error">読み込みエラー: ' + escapeHtml(err.message) + "</p>";
    }
  }

  async function handleAction(btn, days) {
    const action = btn.getAttribute("data-action");
    const dateKey = btn.getAttribute("data-date");
    const day = days.find((d) => d.date === dateKey);
    const qid = btn.getAttribute("data-id");

    if (action === "copy-id" && qid) {
      const ok = await copyText(qid);
      $("xsched-status").textContent = ok ? `IDをコピーしました: ${qid}` : "コピーに失敗しました";
      return;
    }

    if (action === "copy-fix" && day) {
      const ok = await copyText(formatFixRequest(day));
      $("xsched-status").textContent = ok
        ? "修正依頼文をコピーしました（Cursor等に貼り付けてSAPクイズを修正）"
        : "コピーに失敗しました";
      return;
    }

    if (!overrideFn || !dateKey) return;
    btn.disabled = true;
    try {
      if (action === "repick") {
        await overrideFn({ dateKey, action: "repick" });
      } else if (action === "clear") {
        if (!confirm(`${dateKey} の差し替え固定を解除しますか？`)) return;
        await overrideFn({ dateKey, action: "clear" });
      } else if (action === "set-id") {
        const input = prompt(
          "固定する問題IDを入力（例: j-447, sc-fi-234, t-RZ11）",
          day && day.questionId ? day.questionId : ""
        );
        if (!input) return;
        const note = prompt("メモ（任意）", "") || "";
        await overrideFn({
          dateKey,
          action: "set",
          questionId: input.trim(),
          note,
        });
      }
      await loadSchedule();
      $("xsched-status").textContent = `${dateKey} を更新しました`;
    } catch (err) {
      $("xsched-status").textContent = "エラー: " + err.message;
    } finally {
      btn.disabled = false;
    }
  }

  function init(auth) {
    if (!auth || scheduleFn) return;
    scheduleFn = firebase
      .app()
      .functions("asia-northeast1")
      .httpsCallable("getXDailySapSchedule");
    overrideFn = firebase
      .app()
      .functions("asia-northeast1")
      .httpsCallable("setXDailySapScheduleOverride");

    const refreshBtn = $("xsched-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", loadSchedule);
    }
  }

  function onTabShow() {
    if (!scheduleFn) return;
    if (!loaded) loadSchedule();
    else loadSchedule();
  }

  window.AdminXSchedule = { init, onTabShow };
})();
