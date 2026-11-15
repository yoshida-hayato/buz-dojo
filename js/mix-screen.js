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

