//
// ミックス出題の画面の描き手と、開始の段取り (第3段)。
// 札と既定の印を決める規則は js/mix-ui.js に在る。ここは描くだけと、
// 読む・組む・落とす・渡すの順を守るだけにする。
//
// 順番が肝である。出題枠を落とすのは「並べたあと」でなければならない。
// 先に落とすと、科目ごとに先頭の N問 しか当たらず、毎日同じ問題が出る。
//
const MixScreen = (function () {
  const LIST_ID = "mix-subject-list";
  const HINT_ID = "mix-subject-hint";
  const PROGRESS_ID = "mix-progress";
  const NAME = "mix-subject";
  const OPEN_LABEL = "混ぜる科目を選ぶ";
  const CLOSE_LABEL = "科目の選択を閉じる";

  function el(id) {
    return typeof document === "undefined" ? null : document.getElementById(id);
  }

  function registryRows() {
    if (typeof SUBJECT_REGISTRY === "undefined" || !Array.isArray(SUBJECT_REGISTRY)) {
      return [];
    }
    return SUBJECT_REGISTRY;
  }

  function countsMap() {
    const out = {};
    const cat =
      typeof PricingConfig !== "undefined" && PricingConfig.SUBJECT_CATALOG
        ? PricingConfig.SUBJECT_CATALOG
        : null;
    if (!cat) return out;
    Object.keys(cat).forEach((id) => {
      out[id] = (cat[id] && cat[id].questionCount) || 0;
    });
    return out;
  }

  function rows() {
    const E = typeof Entitlement !== "undefined" ? Entitlement : null;
    return MixUI.listRowsFrom(registryRows(), {
      currentId: typeof CURRENT_SUBJECT !== "undefined" && CURRENT_SUBJECT ? CURRENT_SUBJECT.id : "",
      counts: countsMap(),
      hasAccess: E ? function (id) { return E.hasAccess(id); } : null,
      remainingFree: E ? function (id) { return E.remainingFree(id); } : null,
      quotaLabel: E ? function (rem) { return E.freeQuotaLabel(rem); } : null,
    });
  }

  function render() {
    const box = el(LIST_ID);
    if (!box) return;
    box.innerHTML = "";
    rows().forEach((row) => {
      const label = document.createElement("label");
      label.className = "mix-row mix-row-" + row.state;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = NAME;
      input.value = row.id;
      input.checked = row.checked;
      input.disabled = !row.selectable;
      const name = document.createElement("span");
      name.className = "mix-row-name";
      name.textContent = row.title;
      const meta = document.createElement("span");
      meta.className = "mix-row-meta";
      const bits = [];
      if (row.count) bits.push(row.count + "問");
      if (row.note) bits.push(row.note);
      meta.textContent = bits.join(" / ");
      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(meta);
      box.appendChild(label);
    });
    updateHint();
  }

  function selectedIds() {
    const box = el(LIST_ID);
    const out = [];
    if (!box) return out;
    const inputs = box.querySelectorAll("input[name=" + NAME + "]");
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      // 開いている科目は印を外せないので、disabled でも checked なら入れる
      if (input.checked) out.push(input.value);
    }
    return out;
  }

  function updateHint() {
    const hint = el(HINT_ID);
    if (!hint) return;
    const sum = MixUI.selectionSummary(rows(), selectedIds());
    const parts = [sum.subjects + "科目 / 約" + sum.questions + "問"];
    if (sum.heavy) {
      parts.push("問題が多いので、読み込みに時間がかかります。外す科目を選べます");
    }
    hint.textContent = parts.join("。");
  }

  // 混ぜる相手が1本でも在るか (開いている科目だけなら、通常の出題でよい)
  function isMixed() {
    return selectedIds().length > 1;
  }

  function say(text) {
    const box = el(PROGRESS_ID);
    if (!box) return;
    box.textContent = text || "";
    box.classList.toggle("hidden", !text);
  }

  function progressText(e) {
    if (!e) return "";
    if (e.phase === "loading") return "読み込み中 " + e.done + " / " + e.total + " 科目";
    if (e.phase === "loaded") return "読み込み中 " + e.done + " / " + e.total + " 科目";
    if (e.phase === "failed") {
      return "読み込み中 " + e.done + " / " + e.total + " 科目（1科目を飛ばしました）";
    }
    if (e.phase === "done") {
      if (!e.loaded) return "";
      return e.loaded + " 科目を読み込みました";
    }
    return "";
  }

  async function start() {
    const ids = selectedIds();
    const settings = getSettings();
    const E = typeof Entitlement !== "undefined" ? Entitlement : null;
    const gate = E ? E.canStartMixed(ids, settings.count) : { ok: true, caps: [] };
    if (!gate.ok) {
      say("");
      if (typeof showFreeQuotaExhaustedAtStart === "function") {
        showFreeQuotaExhaustedAtStart();
      }
      return;
    }
    let want = settings;
    if (gate.cappedTo != null && Number.isFinite(gate.remaining)) {
      const asked = settings.count === "all" ? Infinity : Number(settings.count) || 0;
      if (gate.cappedTo < asked) {
        if (!confirm("無料枠の都合で" + gate.cappedTo + "問にします。このまま開始しますか？")) {
          return;
        }
      }
      want = Object.assign({}, settings, { count: gate.cappedTo });
    }
    say("読み込み中 0 / " + ids.length + " 科目");
    let res = null;
    try {
      res = await MixSession.collectSources(ids, {
        onProgress: function (e) { say(progressText(e)); },
      });
    } catch (e) {
      say("科目の読み込みに失敗しました");
      return;
    }
    if (!res.sources.length) {
      say("どの科目も読み込めませんでした");
      return;
    }
    // 組む → 並べる → 落とす の順。落とすのを先にしてはいけない
    let slots = buildMixedPoolFrom(want, res.sources);
    slots = orderPoolAvoidingRecent(slots);
    slots = capMixedSlotsByQuota(slots, gate.caps);
    if (!slots.length) {
      say("この条件では出題できる問題がありません");
      return;
    }
    say("");
    startQuiz(want, { mixedSlots: slots });
  }

  // 一覧は開いている科目ごとに1度だけ描く。updatePoolCount は出題設定を
  // 触るたびに呼ばれるので、毎回描き直すと利用者が外した印が戻ってしまう。
  let renderedFor = null;

  function ensure() {
    const box = el(LIST_ID);
    if (!box) return;
    const sid =
      typeof CURRENT_SUBJECT !== "undefined" && CURRENT_SUBJECT
        ? String(CURRENT_SUBJECT.id || "")
        : "";
    if (!sid) return;
    wire();
    if (renderedFor === sid) return;
    renderedFor = sid;
    // 科目が変わったら畳んだ状態に戻す
    box.classList.add("hidden");
    const startBtn = el("mix-start-btn");
    if (startBtn) startBtn.classList.add("hidden");
    const toggle = el("mix-toggle-btn");
    if (toggle) toggle.textContent = OPEN_LABEL;
    say("");
    render();
  }

  function toggle() {
    const box = el(LIST_ID);
    const startBtn = el("mix-start-btn");
    const btn = el("mix-toggle-btn");
    if (!box) return;
    const show = box.classList.contains("hidden");
    box.classList.toggle("hidden", !show);
    if (startBtn) startBtn.classList.toggle("hidden", !show);
    if (btn) btn.textContent = show ? CLOSE_LABEL : OPEN_LABEL;
    if (show) updateHint();
  }

  function wire() {
    const box = el(LIST_ID);
    if (box && box.dataset.mixWired !== "1") {
      box.dataset.mixWired = "1";
      box.addEventListener("change", updateHint);
    }
    const btn = el("mix-toggle-btn");
    if (btn && btn.dataset.mixWired !== "1") {
      btn.dataset.mixWired = "1";
      btn.addEventListener("click", toggle);
    }
    const startBtn = el("mix-start-btn");
    if (startBtn && startBtn.dataset.mixWired !== "1") {
      startBtn.dataset.mixWired = "1";
      startBtn.addEventListener("click", function () {
        void start();
      });
    }
  }

  // 問題の札を描く。他科目の問題なら自分で描いて true を返し、
  // 開いている科目の問題なら false を返す (呼び元が従来どおり描く)。
  function paintQuestionMeta(q) {
    const box = el("question-meta");
    if (!box) return false;
    const badges = MixUI.foreignBadges(q, {
      currentId:
        typeof CURRENT_SUBJECT !== "undefined" && CURRENT_SUBJECT
          ? CURRENT_SUBJECT.id
          : "",
      categories: typeof CATEGORIES !== "undefined" ? CATEGORIES : {},
      priorities: typeof PRIORITIES !== "undefined" ? PRIORITIES : {},
      titleOf: subjectTitleOf,
    });
    if (!badges) return false;
    box.innerHTML = "";
    badges.forEach((bd) => {
      const span = document.createElement("span");
      span.className =
        bd.kind === "priority" ? "badge priority-" + bd.priority : "badge";
