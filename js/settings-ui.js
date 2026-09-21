/** 出題設定 UI・プール構築 */

// ===== 出題設定UI =====
function makeChip(groupName, value, label, count, checked, onChange) {
  const lab = document.createElement("label");
  lab.className = "chip" + (checked ? " checked" : "");
  lab.innerHTML =
    `<input type="checkbox" name="${groupName}" value="${escapeHtml(value)}" ${checked ? "checked" : ""}>` +
    `<span>${escapeHtml(label)}</span>` +
    (count != null ? `<span class="chip-count">${count}問</span>` : "");
  lab.querySelector("input").addEventListener("change", (e) => {
    lab.classList.toggle("checked", e.target.checked);
    if (typeof onChange === "function") onChange(e);
    updatePoolCount();
  });
  return lab;
}

/** モジュール絞り込みの対象外カテゴリ（MODULE_FILTERABLE に無いもの） */
function isModuleFilterExcluded(cat) {
  return !MODULE_FILTERABLE.has(cat);
}
/** モジュール絞り込みの対象カテゴリは applySubjectConfig で設定（MODULE_FILTERABLE） */
/** 外したモジュールの記憶は app-state の uncheckedModules */

function countPoolSlotsBy(field, overrides) {
  const settings = getSettings();
  const slots = buildPool({ ...settings, ...overrides });
  const counts = {};
  for (const slot of slots) {
    const key = slot.entry[field];
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/**
 * モジュール件数用のプール。モジュール選択は無視し、カテゴリ・優先度・出題対象・解答方式だけを見る。
 * 「両方出題」ではTコードを選択式枠＋記述式枠で数える（実際の出題枠と同じ）。
 */
function countPoolSlotsByModule() {
  return countPoolSlotsBy("module", { modules: "all" });
}

/**
 * カテゴリ件数用のプール。カテゴリ選択は無視し、モジュール・優先度・出題対象・解答方式を見る。
 * モジュールチップが無い（ショートカット・略称のみ）ときはモジュール絞り込みをかけない。
 */
function countPoolSlotsByCategory() {
  const settings = getSettings();
  const moduleInputs = document.querySelectorAll('input[name="module"]');
  const hasModuleFilter =
    moduleInputs.length > 0 &&
    settings.categories.some((c) => MODULE_FILTERABLE.has(c));
  return countPoolSlotsBy("category", {
    categories: Object.keys(CATEGORIES),
    modules: hasModuleFilter ? settings.modules : "all",
  });
}

/** 出題カテゴリチップの件数だけ更新する（チェック状態は維持する） */
function updateCategoryChipCounts() {
  const catBox = $("category-chips");
  if (!catBox) return;
  const counts = countPoolSlotsByCategory();
  catBox.querySelectorAll('input[name="category"]').forEach((input) => {
    const span = input.closest(".chip")?.querySelector(".chip-count");
    if (span) span.textContent = `${counts[input.value] || 0}問`;
  });
}

/** 教科書科目は章プール固定（モジュール全選択でロック迂回させない） */
function isTextbookSettingsMode() {
  return (
    typeof ChapterProgress !== "undefined" &&
    typeof CURRENT_SUBJECT !== "undefined" &&
    CURRENT_SUBJECT &&
    ChapterProgress.hasTextbook(CURRENT_SUBJECT)
  );
}

/** 教科書時は選択中章（なければ現在章）の module のみに戻す */
function enforceTextbookModuleSelection() {
  if (!isTextbookSettingsMode()) return null;
  const chapterId =
    typeof homeChapterSelectedId !== "undefined" ? homeChapterSelectedId : null;
  return ChapterProgress.applyTextbookModuleFilter(CURRENT_SUBJECT, chapterId);
}

/**
 * モジュール・分野のチップを、絞り込み対象カテゴリ横断で1行表示する。
 * 件数はホームの出題設定（未習得のみ・誤答のみ・優先度・解答方式）に合わせる。
 * ショートカット・略称のみ選択時は絞り込み不可の旨を表示する。
 * 教科書科目では「いま第N章のみ」固定・全選択／解除を出さない。
 */
function renderModuleChips() {
  const selectedCats = getCheckedValues("category");
  const filterableCats = selectedCats.filter((c) => MODULE_FILTERABLE.has(c));
  const hasExcludedOnly =
    selectedCats.length > 0 && filterableCats.length === 0;
  const hasExcludedMixed = selectedCats.some((c) => isModuleFilterExcluded(c));
  const textbook = isTextbookSettingsMode();
  const textbookChapter = textbook ? enforceTextbookModuleSelection() : null;

  const modBox = $("module-chips");
  modBox.innerHTML = "";
  // 教科書は全選択で章ロックを迂回できるため、操作自体を隠す
  $("module-actions").classList.toggle(
    "hidden",
    filterableCats.length === 0 || textbook
  );

  if (filterableCats.length === 0) {
    if (hasExcludedOnly) {
      modBox.innerHTML =
        '<p class="setting-hint module-no-filter">ショートカット・略称はモジュールで絞り込めません。</p>';
    }
    return;
  }

  const counts = countPoolSlotsByModule();

  const chipRow = document.createElement("div");
  chipRow.className = "chip-group";
  Object.entries(MODULES).forEach(([key, modLabel]) => {
    if (!counts[key]) return;
    const chip = makeChip("module", key, modLabel, counts[key], !uncheckedModules.has(key), (e) => {
      if (textbook) {
        // ロック迂回防止: 変更を取り消して章のみに戻す
        e.preventDefault();
        enforceTextbookModuleSelection();
        renderModuleChips();
        updatePoolCount();
        return;
      }
      if (e.target.checked) uncheckedModules.delete(key);
      else uncheckedModules.add(key);
    });
    if (textbook) {
      const input = chip.querySelector("input");
      if (input) input.disabled = true;
      chip.classList.add("is-textbook-fixed");
      chip.title = "章の範囲は上の「学習の章」で選びます";
    }
    chipRow.appendChild(chip);
  });
  if (!chipRow.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "setting-hint";
    empty.textContent = "この出題設定では、表示できるモジュールがありません。";
    modBox.appendChild(empty);
  } else {
    modBox.appendChild(chipRow);
  }

  if (textbook && textbookChapter) {
    const note = document.createElement("p");
    note.className = "setting-hint";
    note.textContent = `いまは第${textbookChapter.order}章「${textbookChapter.module}」のみ出題します。章は上の「学習の章」で切り替えます。`;
    modBox.appendChild(note);
  }

  if (hasExcludedMixed) {
    const note = document.createElement("p");
    note.className = "setting-hint";
    note.textContent = "※ ショートカット・略称はモジュール絞り込みの対象外です。";
    modBox.appendChild(note);
  }
}

/**
 * 出題形式・解答方式が選択中のカテゴリで意味を持つかどうかを表示に反映する。
 * - 出題形式（コード⇔機能）: Tコード・ショートカット問題のみに適用される
 * - 解答方式（記述式）: inputCategories に含まれるカテゴリ
 */
function updateSettingRelevance() {
  const cats = getCheckedValues("category");
  const answerModeGroup = $("answer-mode-group");
  const directionGroup = $("direction-group");
  const usesDirection =
    typeof subjectUsesDirection === "function" ? subjectUsesDirection() : true;
  const usesInput =
    typeof subjectUsesInput === "function" ? subjectUsesInput() : true;

  // 科目非対応は常に hidden（生管・ショートカットで Tコード／記述式 UI を出さない）
  if (typeof applySubjectSettingVisibility === "function") {
    applySubjectSettingVisibility();
  } else {
    if (directionGroup) directionGroup.classList.toggle("hidden", !usesDirection);
    if (answerModeGroup) answerModeGroup.classList.toggle("hidden", !usesInput);
    const dirAnsRow = $("direction-answer-row");
    if (dirAnsRow) dirAnsRow.classList.toggle("hidden", !usesDirection && !usesInput);
  }

  const dirRelevant = usesDirection && cats.includes("tcode");
  $("direction-select").disabled = !dirRelevant;
  if (directionGroup) directionGroup.classList.toggle("irrelevant", !dirRelevant);
  $("direction-hint").textContent = dirRelevant
    ? "Tコード問題に適用されます（用語・シナリオ・正誤・略称・並べ替え・穴埋め・ショートカットは形式が固定です）"
    : "選択中のカテゴリでは使われません（Tコード問題用の設定です）";

  const inputRelevant = usesInput && cats.some((c) => INPUT_CATEGORIES.has(c));
  $("answer-mode-select").disabled = !inputRelevant;
  if (answerModeGroup) {
    answerModeGroup.classList.toggle("irrelevant", !inputRelevant);
  }
  $("answer-mode-hint").textContent = inputRelevant
    ? "記述式・両方出題は入力対応カテゴリのみ。「両方」は選択式枠と記述式枠を別カウントし、各方式の未習得だけ出します"
    : "選択中のカテゴリでは使われません（記述式に対応するカテゴリを選んでください）";
}

let settingsUiWired = false;
function initSettingsUI() {
  const catBox = $("category-chips");
  catBox.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, label]) => {
    const checked =
      !DEFAULT_CATEGORIES || DEFAULT_CATEGORIES.length === 0
        ? true
        : DEFAULT_CATEGORIES.includes(key);
    const chip = makeChip("category", key, label, 0, checked);
    // カテゴリが変わったらモジュールチップを作り直す（件数を再計算してからプール数を更新）
    chip.querySelector("input").addEventListener("change", () => {
      renderModuleChips();
      updateSettingRelevance();
      updatePoolCount();
    });
    catBox.appendChild(chip);
  });

  const priBox = $("priority-chips");
  priBox.innerHTML = "";
  Object.entries(PRIORITIES).forEach(([key, label]) => {
    priBox.appendChild(makeChip("priority", key, label, null, true, () => {
      renderModuleChips();
      updatePoolCount();
    }));
  });

  renderModuleChips();
  updateSettingRelevance();

  if (isTextbookSettingsMode()) {
    enforceTextbookModuleSelection();
    renderModuleChips();
  }

  if (!settingsUiWired) {
    settingsUiWired = true;
    $("module-all").addEventListener("click", () => {
      if (isTextbookSettingsMode()) {
        enforceTextbookModuleSelection();
        renderModuleChips();
        updatePoolCount();
        return;
      }
      document.querySelectorAll('input[name="module"]').forEach((i) => uncheckedModules.delete(i.value));
      setAllChips("module", true);
    });
    $("module-none").addEventListener("click", () => {
      if (isTextbookSettingsMode()) {
        enforceTextbookModuleSelection();
        renderModuleChips();
        updatePoolCount();
        return;
      }
      document.querySelectorAll('input[name="module"]').forEach((i) => uncheckedModules.add(i.value));
      setAllChips("module", false);
    });
    $("direction-select").addEventListener("change", updatePoolCount);
    $("pool-mode-select").addEventListener("change", () => {
      renderModuleChips();
      updatePoolCount();
    });
    $("answer-mode-select").addEventListener("change", () => {
      $("answer-mode-select").dataset.userSet = "1";
      updateSettingRelevance();
      renderModuleChips();
      updatePoolCount();
    });
    const rescueAll = $("pool-rescue-all");
    if (rescueAll) {
      rescueAll.addEventListener("click", () => {
        $("pool-mode-select").value = "all";
        // 詳細が閉じている場合でも値は効く
        renderModuleChips();
        updatePoolCount();
        if (!$("start-btn").disabled && typeof startQuiz === "function") {
          startQuiz(getSettings());
        }
      });
    }
    const rescueWrong = $("pool-rescue-wrong");
    if (rescueWrong) {
      rescueWrong.addEventListener("click", () => {
        $("pool-mode-select").value = "wrong";
        renderModuleChips();
        updatePoolCount();
        if (!$("start-btn").disabled && typeof startQuiz === "function") {
          startQuiz(getSettings());
        }
      });
    }
  }
  updatePoolCount();
}

function setAllChips(groupName, checked) {
  document.querySelectorAll(`input[name="${groupName}"]`).forEach((input) => {
    input.checked = checked;
    input.closest(".chip").classList.toggle("checked", checked);
  });
  updatePoolCount();
}

function getCheckedValues(groupName) {
  return Array.from(document.querySelectorAll(`input[name="${groupName}"]:checked`)).map((i) => i.value);
}

function getSettings() {
  const usesInput =
    typeof subjectUsesInput === "function" ? subjectUsesInput() : true;
  const usesDirection =
    typeof subjectUsesDirection === "function" ? subjectUsesDirection() : true;
  // 教科書は開始直前も章モジュールだけにする（詳細UI迂回の最終ガード）
  if (isTextbookSettingsMode()) {
    enforceTextbookModuleSelection();
  }
  let modules = getCheckedValues("module");
  if (isTextbookSettingsMode() && CURRENT_SUBJECT) {
    const progress = ChapterProgress.load(CURRENT_SUBJECT);
    const ch =
      (typeof homeChapterSelectedId !== "undefined" &&
        homeChapterSelectedId &&
        ChapterProgress.getChapter(CURRENT_SUBJECT, homeChapterSelectedId)) ||
      ChapterProgress.currentChapter(CURRENT_SUBJECT, progress);
    if (ch && ch.module) modules = [ch.module];
  }
  return {
    categories: getCheckedValues("category"),
    modules,
    priorities: getCheckedValues("priority").map(Number),
    // 非対応科目では Tコード／記述式前提の値を使わない
    direction: usesDirection ? $("direction-select").value : "name2code",
    count: $("count-select").value,
    answerMode: usesInput ? $("answer-mode-select").value : "choice",
    poolMode: $("pool-mode-select").value,
  };
}

/**
 * 設定に合致する出題枠プールを返す。
 * 戻り値: { entry, forceInputMode }[]
 *   forceInputMode: true=記述式 / false=選択式
 *
 * modules はモジュールキーの配列（MODULE_FILTERABLE にのみ適用）
 * poolMode: "unmastered" / "wrong" / "all"
 *
 * answerMode=both のとき、入力対応カテゴリは選択式枠と記述式枠を別々に載せる（同じ問題が最大2枠）。
 *   - 選択式枠: 選択式習得済みなら載せない
 *   - 記述式枠: 記述式習得済みなら載せない
 */
function buildPool(settings) {
  let includeSet = null;
  const choiceMastered = new Set(QuizStorage.choiceMasteredIds());
  const inputMastered = new Set(QuizStorage.inputMasteredIds());
  const mode = settings.answerMode || "choice";

  const onlyIdsMode = Array.isArray(settings.onlyIds) && settings.onlyIds.length > 0;
  if (onlyIdsMode) {
    // 特定 ID だけ出す（結果画面の「一番つまずいた問題」復習など）
    includeSet = new Set(settings.onlyIds);
  } else if (settings.poolMode === "wrong") {
    includeSet = new Set(QuizStorage.wrongIds());
  }

  // モジュールチップが無い／未生成のときは絞らない（空配列で全問除外になるのを防ぐ）
  const moduleInputs = document.querySelectorAll('input[name="module"]');
  const hasModuleFilter =
    !onlyIdsMode &&
    moduleInputs.length > 0 &&
    settings.categories.some((c) => MODULE_FILTERABLE.has(c));

  const base = QUIZ_DATA.filter((q) => {
    if (includeSet && !includeSet.has(q.id)) return false;
    if (onlyIdsMode) return true;
    if (!settings.categories.includes(q.category)) return false;
    if (!settings.priorities.includes(q.priority)) return false;
    if (
      hasModuleFilter &&
      MODULE_FILTERABLE.has(q.category) &&
      settings.modules !== "all" &&
      !settings.modules.includes(q.module)
    ) {
      return false;
    }
    return true;
  });

  const slots = [];
  for (const q of base) {
    const isInputCat = INPUT_CATEGORIES.has(q.category);
    if (mode === "both" && isInputCat) {
      const choiceOk =
        settings.poolMode !== "unmastered" || !choiceMastered.has(q.id);
      const inputOk =
        settings.poolMode !== "unmastered" || !inputMastered.has(q.id);
      if (choiceOk) slots.push({ entry: q, forceInputMode: false });
      if (inputOk) slots.push({ entry: q, forceInputMode: true });
      continue;
    }

    // 選択式のみ / 記述式のみ / 両方でも非入力カテゴリ
    if (settings.poolMode === "unmastered") {
      if (mode === "input" && isInputCat) {
        if (inputMastered.has(q.id)) continue;
      } else if (choiceMastered.has(q.id)) {
        continue;
      }
    }
    const forceInputMode = mode === "input" && isInputCat;
    slots.push({ entry: q, forceInputMode });
  }
  return slots;
}

function updatePoolCount() {
  const settings = getSettings();
  const pool = buildPool(settings);
  const usesInput =
    typeof subjectUsesInput === "function" ? subjectUsesInput() : true;
  let note = "";
  if (pool.length === 0 && settings.poolMode === "unmastered") {
    if (usesInput && settings.answerMode === "input") {
      note =
        "（入力対応カテゴリは記述式習得済み、その他は選択式習得済みを除外中です。出題対象を「すべての問題」にすると出題できます）";
    } else if (usesInput && settings.answerMode === "both") {
      note =
        "（選択式枠・記述式枠それぞれで習得済みを除外した結果、出題できる枠がありません）";
    } else {
      note = "（習得済みの問題を除外中です。下のボタンですぐ再開できます）";
    }
  } else if (pool.length === 0 && settings.poolMode === "wrong") {
    note = "（間違えたことのある問題がありません）";
  } else if (
    usesInput &&
    settings.answerMode === "both" &&
    settings.categories.some((c) => INPUT_CATEGORIES.has(c))
  ) {
    const choiceSlots = pool.filter((s) => !s.forceInputMode).length;
    const inputSlots = pool.filter((s) => s.forceInputMode).length;
    note = `（選択式枠 ${choiceSlots}＋記述式枠 ${inputSlots}。同じ問題でも別枠です）`;
  }
  $("pool-count").innerHTML = `該当する問題: <strong>${pool.length}</strong> 問${escapeHtml(note)}`;
  // 誤答の選択肢は全問題データから作るので、プールは1問あれば出題できる
  $("start-btn").disabled = pool.length < 1 || isFreeQuotaExhausted();

  const rescue = $("pool-rescue");
  if (rescue) {
    const showRescue = pool.length < 1;
    rescue.classList.toggle("hidden", !showRescue);
    const hint = rescue.querySelector(".pool-rescue-hint");
    if (hint && showRescue) {
      if (settings.poolMode === "wrong") {
        hint.textContent =
          "間違えた問題がありません。すべての問題で始めるか、出題条件を見直してください。";
      } else if (settings.poolMode === "unmastered") {
        hint.textContent =
          "未習得の問題がありません。すべての問題で再開するか、間違えた問題に切り替えられます。";
      } else {
        hint.textContent = "この条件では出題できる問題がありません。";
      }
    }
    const wrongBtn = $("pool-rescue-wrong");
    if (wrongBtn) {
      const hasWrongs =
        typeof QuizStorage !== "undefined" && QuizStorage.wrongIds().length > 0;
      // すでに wrong、または間違えた問題が無いときは出さない
      wrongBtn.classList.toggle("hidden", settings.poolMode === "wrong" || !hasWrongs);
    }
  }
  updateCategoryChipCounts();
}

/** 出題枠に応じて記述式にするか決める（forceInputMode があればそれを優先） */
function resolveInputMode(entry, settings, forceInputMode) {
  if (typeof forceInputMode === "boolean") return forceInputMode;
  if (!INPUT_CATEGORIES.has(entry.category)) return false;
  return (settings.answerMode || "choice") === "input";
}
