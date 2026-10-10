// 管理者: Stripe の状態を画面で読む (鍵のモード / Webhook の送信対象イベント)。
// getStripeMode と getStripeWebhookStatus は本番に出ているのに呼ぶ画面が無く、
// 社長がコンソールに1行貼る以外に読む手が無かった。その代わりの画面。
//
// admin-reports.js の switchTab は既知のパネル id だけを畳むので、
// このパネルは nav への委譲リスナ1本で自分の面倒を見る。
//
// 器の制約: firebase と app() は行を分ける。1行に続けると Slack が
// 「firebase 点 app」をドメインと見てリンク記法に書き換え、構文が壊れた
// まま main に入る (10/11 03:42 に破棄された形)。
(function () {
  var TAB_ID = "stripe";
  var PANEL_ID = "panel-stripe";
  var REGION = "asia-northeast1";
  var MODE_FN = "getStripeMode";
  var HOOK_FN = "getStripeWebhookStatus";
  // 買い切りで付与を取り消せる経路はこの2件だけ。欠けると返金しても付与が残る。
  var REVOKE = ["charge.refunded", "charge.dispute.closed"];

  var busy = false;

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "&quot;");
  }

  function callFn(name) {
    var fn = firebase
      .app()
      .functions(REGION)
      .httpsCallable(name);
    return fn({}).then(function (r) { return (r && r.data) || null; });
  }

  function stat(label, value, sub) {
    return '<div class="analytics-stat">' +
      '<div class="analytics-stat-label">' + esc(label) + "</div>" +
      '<div class="analytics-stat-value">' + esc(value) + "</div>" +
      (sub ? '<div class="analytics-stat-sub">' + esc(sub) + "</div>" : "") +
      "</div>";
  }

  function modeCard(mode) {
    if (!mode) return "";
    var kind = mode.stripeMode === "live" ? "本番 (live)" : "テスト (test)";
    return '<div class="card">' +
      '### 鍵のモード' +
      '<div class="analytics-stat-grid">' +
      stat("いま動いている鍵", kind, "Stripe が返す livemode の値") +
      stat("直近の課金", String(mode.chargeCount) + " 件", "最新10件まで") +
      "</div></div>";
  }

  // 社長が知りたい1行を先に出す: 返金とチャージバックで付与が取り消されるか。
  function revokeVerdict(ep) {
    var events = ep.enabledEvents || [];
    if (ep.subscribesEverything) {
      return { ok: true, text: "全イベントを購読しているので、返金もチャージバックも届きます" };
    }
    var lack = REVOKE.filter(function (n) { return events.indexOf(n) < 0; });
    if (!lack.length) return { ok: true, text: "返金とチャージバック確定はどちらも購読済みです" };
    return { ok: false, text: "付与を取り消せません。欠けている: " + lack.join(" / ") };
  }

  function endpointCard(ep) {
    var v = revokeVerdict(ep);
    var missing = ep.subscribesEverything ? [] : (ep.missing || []);
    var head = v.ok
      ? '<p class="reports-empty">' + esc(v.text) + "</p>"
      : '<p class="reports-error">' + esc(v.text) + "</p>";
    var rest = missing.length
      ? '<p class="reports-error">コードが分岐しているのに購読されていないもの: ' +
        esc(missing.join(" / ")) + "</p>"
      : '<p class="analytics-note">コードが分岐しているイベントはすべて購読されています。</p>';
    var events = ep.subscribesEverything
      ? "全イベント"
      : (ep.enabledEvents || []).join(" / ") || "なし";
    return '<div class="card">' +
      '### ' + esc(ep.url || "(url 不明)") + "" +
      head + rest +
      '<div class="analytics-stat-grid">' +
      stat("状態", ep.status || "不明", "Stripe 側の enabled / disabled") +
      stat("種別", ep.endpointLivemode ? "本番 (live)" : "テスト (test)", "") +
      stat("購読件数", String(ep.eventCount) + " 件", "") +
      "</div>" +
      '<p class="analytics-note">送信対象: ' + esc(events) + "</p>" +
      "</div>";
  }

  function render(mode, hook) {
    var out = modeCard(mode);
    if (!hook) return out;
    var eps = hook.endpoints || [];
    if (!eps.length) {
      return out + '<div class="card"><p class="reports-error">' +
        esc(hook.keyMode || "?") +
        " の鍵で見える Webhook の登録が0件です。付与の取り消しは1件も届きません。</p></div>";
    }
    return out + eps.map(endpointCard).join("");
  }

  function setNote(text) {
    var el = document.getElementById("stripe-status-note");
    if (el) el.textContent = text;
  }

  function load() {
    if (busy) return;
    busy = true;
    setNote("読み込み中");
    var body = document.getElementById("stripe-status-body");
    Promise.all([callFn(MODE_FN), callFn(HOOK_FN)])
      .then(function (both) {
        if (body) body.innerHTML = render(both[0], both[1]);
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
      "<strong>Stripe の状態</strong>" +
      '<span id="stripe-status-note" class="reports-open-count">タブを開くと読み込みます</span>' +
      '</div><div class="reports-toolbar-actions">' +
      '<button type="button" class="secondary-btn" id="stripe-status-refresh">再読み込み</button>' +
      '</div></div><div id="stripe-status-body"></div>';
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
    btn.textContent = "Stripe状態";
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
      if (mine) load();
    });

    var refresh = document.getElementById("stripe-status-refresh");
    if (refresh) refresh.addEventListener("click", load);
  }

  window.AdminStripeStatus = { render: render, revokeVerdict: revokeVerdict, load: load };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
