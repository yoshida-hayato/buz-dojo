/**
 * 章順教科書の進捗（既存 stats / storageKey とは別キー）
 * 正本: docs/ONTOLOGY_INTRO_TEXTBOOK.md
 * キー例: biz_dojo_ai_ontology_intro_chapters_v1
 */
const ChapterProgress = (function () {
  function hasTextbook(subject) {
    return !!(
      subject &&
      subject.defaultStudyMode === "textbook" &&
      Array.isArray(subject.chapters) &&
      subject.chapters.length > 0
    );
  }

  function progressKey(subject) {
    if (!subject) return null;
    if (subject.chapterProgressKey) return subject.chapterProgressKey;
    if (subject.storageKey && /_stats_v1$/.test(subject.storageKey)) {
      return subject.storageKey.replace(/_stats_v1$/, "_chapters_v1");
    }
    return null;
  }

  function sortedChapters(subject) {
    return (subject.chapters || [])
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }

  function empty(chapters) {
    return {
      currentChapterId: chapters[0] ? chapters[0].id : null,
      cleared: {},
      correctIdsByChapter: {},
    };
  }

  function load(subject) {
    const chapters = sortedChapters(subject);
    const key = progressKey(subject);
    if (!key || !chapters.length) return empty(chapters);
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      if (!raw || typeof raw !== "object") return empty(chapters);
      return {
        currentChapterId: raw.currentChapterId || chapters[0].id,
        cleared: raw.cleared && typeof raw.cleared === "object" ? raw.cleared : {},
        correctIdsByChapter:
          raw.correctIdsByChapter && typeof raw.correctIdsByChapter === "object"
            ? raw.correctIdsByChapter
            : {},
      };
    } catch (e) {
      return empty(chapters);
    }
  }

  function save(subject, data) {
    const key = progressKey(subject);
    if (!key || !data) return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      /* ignore quota */
    }
  }

  function isCleared(progress, chapterId) {
    return !!(progress && progress.cleared && progress.cleared[chapterId]);
  }

  function isUnlocked(subject, progress, chapterId) {
    const chapters = sortedChapters(subject);
    const idx = chapters.findIndex((c) => c.id === chapterId);
    if (idx < 0) return false;
    if (idx === 0) return true;
    // 済章は復習のため開いたまま（導入章の先頭挿入後も、既クリアをロックしない）
    if (isCleared(progress, chapterId)) return true;
    return isCleared(progress, chapters[idx - 1].id);
  }

  function correctIds(progress, chapterId) {
    const ids = progress && progress.correctIdsByChapter && progress.correctIdsByChapter[chapterId];
    return Array.isArray(ids) ? ids : [];
  }

  function correctCount(progress, chapterId) {
    return correctIds(progress, chapterId).length;
  }

  function getChapter(subject, chapterId) {
    return sortedChapters(subject).find((c) => c.id === chapterId) || null;
  }

  function chapterByModule(subject, moduleName) {
    return sortedChapters(subject).find((c) => c.module === moduleName) || null;
  }

  /** 未クリアの先頭アンロック章。全クリアなら最終章（復習用） */
  function currentChapter(subject, progress) {
    const chapters = sortedChapters(subject);
    if (!chapters.length) return null;
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      if (!isUnlocked(subject, progress, ch.id)) break;
      if (!isCleared(progress, ch.id)) return ch;
    }
    if (progress && progress.currentChapterId) {
      const cur = getChapter(subject, progress.currentChapterId);
      if (cur && isUnlocked(subject, progress, cur.id)) return cur;
    }
    return chapters[chapters.length - 1];
  }

  function allCleared(subject, progress) {
    const chapters = sortedChapters(subject);
    return chapters.length > 0 && chapters.every((c) => isCleared(progress, c.id));
  }

  function resultPayload(progress, extras) {
    return Object.assign(
      {
        progress: progress || null,
        justCleared: false,
        clearedChapter: null,
        nextChapter: null,
        allClearedNow: false,
      },
      extras || {}
    );
  }

  /**
   * 章プール内のユニーク正解を加算。同一問の再正解は数えない。
   * 不正解では呼ばない（進捗は落ちない）。
   * 戻り値: { progress, justCleared, clearedChapter, nextChapter, allClearedNow }
   * 既存クリア済みの再到達は justCleared=false。
   */
  function recordCorrect(subject, questionId, moduleName) {
    if (!hasTextbook(subject) || !questionId || !moduleName) return null;
    const ch = chapterByModule(subject, moduleName);
    if (!ch) return null;
    const progress = load(subject);
    if (!isUnlocked(subject, progress, ch.id)) {
      return resultPayload(progress);
    }

    const prev = correctIds(progress, ch.id);
    if (prev.indexOf(questionId) !== -1) {
      return resultPayload(progress, {
        allClearedNow: allCleared(subject, progress),
      });
    }

    const wasCleared = isCleared(progress, ch.id);
    const next = prev.concat([questionId]);
    progress.correctIdsByChapter[ch.id] = next;
    progress.currentChapterId = ch.id;

    let justCleared = false;
    let clearedChapter = null;
    let nextChapter = null;

    const need = Number(ch.clearCorrect) || 0;
    if (need > 0 && next.length >= need) {
      progress.cleared[ch.id] = true;
      const chapters = sortedChapters(subject);
      const idx = chapters.findIndex((c) => c.id === ch.id);
      if (idx >= 0 && idx < chapters.length - 1) {
        nextChapter = chapters[idx + 1];
        progress.currentChapterId = nextChapter.id;
      }
      if (!wasCleared) {
        justCleared = true;
        clearedChapter = ch;
      } else {
        nextChapter = null;
      }
    }
    save(subject, progress);
    return resultPayload(progress, {
      justCleared,
      clearedChapter,
      nextChapter: justCleared ? nextChapter : null,
      allClearedNow: justCleared && allCleared(subject, progress),
    });
  }

  /** 既存モジュールフィルタ流用: 指定章の module だけ選択 */
  function selectModuleOnly(moduleKey) {
    if (typeof uncheckedModules === "undefined" || typeof MODULES === "undefined") return;
    uncheckedModules.clear();
    Object.keys(MODULES).forEach((key) => {
      if (key !== moduleKey) uncheckedModules.add(key);
    });
  }

  function applyTextbookModuleFilter(subject, chapterId) {
    if (!hasTextbook(subject)) return null;
    const progress = load(subject);
    const ch =
      (chapterId && getChapter(subject, chapterId)) || currentChapter(subject, progress);
    if (!ch || !isUnlocked(subject, progress, ch.id)) return null;
    selectModuleOnly(ch.module);
    return ch;
  }

  return {
    hasTextbook,
    progressKey,
    load,
    save,
    sortedChapters,
    isCleared,
    isUnlocked,
    correctCount,
    getChapter,
    chapterByModule,
    currentChapter,
    allCleared,
    recordCorrect,
    selectModuleOnly,
    applyTextbookModuleFilter,
  };
})();
