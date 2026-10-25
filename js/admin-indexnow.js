// 管理者: IndexNow の送信の状態を画面で読む。
//
// なぜこの画面が要るか: 送信は定時 (毎朝4時41分) に走る関数で、結果は
// Firestore とログにしか残らない。社員は Firestore を読めないので、
// 「送れているのか / 鍵が合っているのか」を人が見る場所がここしか無い。
//
// タブを開くだけでは送らない形にしてある。開いたときに呼ぶ関数は、
// sitemap の一覧が前回と同じなら投げずに台帳だけ返す。だから何度開いても
// IndexNow 側の 429 を招かない。無理に送りたいときだけ、下の押す所を使う。
//
// 器の制約: firebase と app() は行を分ける。1行に続けると Slack が
// 「firebase 点 app」をドメインと見てリンク記法に書き換える。
(function () {
  var TAB_ID = "indexnow";
  var PANEL_ID = "panel-indexnow";
  var REGION = "asia-northeast1";
  var FN = "runIndexNowSubmit";

  var busy = false;

  function esc(s) {
    return escapeHtml(s === null || s === undefined ? "" : s);
  }

  function callFn(force) {
    var fn = firebase
      .app()
      .functions(REGION)
      .httpsCallable(FN);
    return fn({ force: force === true }).then(function (r) { return (r && r.data) || null; });
  }

  function stat(label, value, sub) {
    return '<div class="analytics-stat">' +
      '<div class="analytics-stat-label">' + esc(label) + "</div>" +
      '<div class="analytics-stat-value">' + esc(value) + "</div>" +
      (sub ? '<div class="analytics-stat-sub">' + esc(sub) + "</div>" : "") +
      "</div>";
  }

  // 社長がいちばん知りたい1行。数と理由から断定できることだけを書く。
  function verdict(d) {
    var r = (d && d.result) || {};
    var ok = Number((d && d.okCount) || 0);
    var ng = Number((d && d.failCount) || 0);
    if (r.reason === "sitemap_unreachable") {
      return ["送れていません", "本番の sitemap.xml が読めませんでした (" + esc(String(r.status || 0)) + ")。送信の前の段で止まっています。"];
    }
    if (r.reason === "sitemap_empty") {
      return ["送れていません", "sitemap.xml に自分のサイトの URL が0本でした。gen-seo.py の書き出しを先に見ること。"];
    }
    if (r.submitted) {
      return ["送れています", String(r.urlCount) + " 本を受け取られました (" + esc(String(r.status)) + ")。受け取った側が他の参加者にも共有します。Google は参加していません。"];
    }
    if (r.attempted) {
      return ["送信が失敗しました", "返りは " + esc(String(r.status || 0)) + "。403 なら鍵の字面が合っていません。429 なら投げすぎです。" + esc(String(r.error || ""))];
    }
    if (ok > 0) {
      return ["送信済み (今回は送らず)", "一覧が前回と同じなので投げていません。これまでの成功 " + String(ok) + " 回 / 失敗 " + String(ng) + " 回。"];
    }
    return ["まだ1回も送れていません", "理由: " + esc(String(r.reason || "?")) + "。下の押す所で今すぐ送れます。"];
  }

  function render(d) {
    if (!d) return '<div class="card"><p class="reports-error">読み込めませんでした。</p></div>';
    var v = verdict(d);
    var r = d.result || {};
    return '<div class="card">' +
      '<div class="card-subtitle">' + esc(v[0]) + "</div>" +
      '<p class="analytics-note">' + v[1] + "</p>" +
      '<div class="analytics-stat-grid">' +
      stat("今回の判定", String(r.reason || "?"), "unchanged は送らなかった印") +
      stat("sitemap の本数", String(r.urlCount || 0) + " 本", "送る対象の URL の数") +
      stat("成功 / 失敗", String(d.okCount || 0) + " / " + String(d.failCount || 0), "これまでの通算") +
      stat("直近の返り", String(d.lastStatus || 0), String(d.lastError || "")) +
      "</div>" +
      '<p class="analytics-note">鍵の在り処: ' + esc(String(d.keyLocation || "")) + "</p>" +
      "</div>";
  }

  function setNote(text) {
    var el = document.getElementById("indexnow-note");
    if (el) el.textContent = text;
  }

  function load(force) {
    if (busy) return;
    busy = true;
    setNote(force ? "送信中" : "読み込み中");
    var body = document.getElementById("indexnow-body");
    callFn(force)
      .then(function (d) {
        if (body) body.innerHTML = render(d);
        setNote("読み込み済み");
      })
      .catch(function (err) {
        if (body) body.innerHTML =
          '<div class="card"><p class="reports-error">読み込みエラー: ' +
          esc((err && err.message) || err) + "</p></div>";
        setNote("エラー");
      })
      .then(function () {
        busy = false;
      });
  }

  function panelHtml() {
    return '<div class="reports-toolbar card"><div class="reports-toolbar-text">' +
      "<strong>検索側への通知 (IndexNow)</strong>" +
      '<span id="indexnow-note" class="reports-open-count">タブを開くと状態を読み込みます</span>' +
      '</div><div class="reports-toolbar-actions">' +
      '<button type="button" class="secondary-btn" id="indexnow-refresh">状態を読む</button>' +
      '<button type="button" class="secondary-btn" id="indexnow-force">いま送る</button>' +
      '</div></div><div id="indexnow-body"></div>';
  }

  function showMine(on) {
    var mine = document.getElementById(PANEL_ID);
    if (mine) mine.classList.toggle("hidden", !on);
    if (!on) return;
    var panels = document.querySelectorAll(".admin-panel");
    for (var i = 0; i < panels.length; i++) {
      if (panels[i].getAttribute("id") !== PANEL_ID) panels[i].classList.add("hidden");
    }
    var tabs = document.querySelectorAll(".admin-tab");
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].classList.toggle(
        "is-active",
        tabs[j].getAttribute("data-tab") === TAB_ID
      );
    }
  }

  function install() {
    var nav = document.querySelector(".admin-tabs");
    var main = document.getElementById("reports-main");
    if (!nav || !main || document.getElementById(PANEL_ID)) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "admin-tab";
    btn.setAttribute("data-tab", TAB_ID);
    btn.textContent = "検索通知";
    nav.appendChild(btn);

    var panel = document.createElement("div");
    panel.setAttribute("id", PANEL_ID);
    panel.className = "admin-panel hidden";
    panel.innerHTML = panelHtml();
    main.appendChild(panel);

    nav.addEventListener("click", function (ev) {
      var t = ev.target;
      var hit = t && t.getAttribute ? t.getAttribute("data-tab") : null;
      if (!hit) return;
      var mine = hit === TAB_ID;
      showMine(mine);
      if (mine) load(false);
    });

    var refresh = document.getElementById("indexnow-refresh");
    if (refresh) refresh.addEventListener("click", function () { load(false); });
    var force = document.getElementById("indexnow-force");
    if (force) force.addEventListener("click", function () { load(true); });
  }

  window.AdminIndexNow = { render: render, verdict: verdict, load: load };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
