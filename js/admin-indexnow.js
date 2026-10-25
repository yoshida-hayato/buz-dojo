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

