/**
 * 読み物レッスンの節進捗（章進捗とは別キー）
 */
const LessonProgress = (function () {
  function lessonKey(subject) {
    if (!subject) return null;
    if (subject.lessonProgressKey) return subject.lessonProgressKey;
    const ck = subject.chapterProgressKey || subject.storageKey;
    if (ck && /_stats_v1$/.test(ck)) {
      return ck.replace(/_stats_v1$/, "_lesson_v1");
    }
    if (ck && /_chapters_v1$/.test(ck)) {
      return ck.replace(/_chapters_v1$/, "_lesson_v1");
    }
    return null;
  }

  function loadAll(subject) {
    const key = lessonKey(subject);
    if (!key) return {};
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(subject, data) {
    const key = lessonKey(subject);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(data || {}));
    } catch (e) {
      /* ignore */
    }
  }

  function chapterState(subject, chapterId) {
    const all = loadAll(subject);
    const st = all[chapterId];
    if (!st || typeof st !== "object") {
      return { sectionIndex: 0, doneSectionIds: {} };
    }
    return {
      sectionIndex: Number(st.sectionIndex) || 0,
      doneSectionIds:
        st.doneSectionIds && typeof st.doneSectionIds === "object"
          ? st.doneSectionIds
          : {},
    };
  }

  function saveChapter(subject, chapterId, st) {
    const all = loadAll(subject);
    all[chapterId] = {
      sectionIndex: st.sectionIndex,
      doneSectionIds: st.doneSectionIds || {},
    };
    saveAll(subject, all);
  }

  function markSectionDone(subject, chapterId, sectionId, nextIndex) {
    const st = chapterState(subject, chapterId);
    st.doneSectionIds[sectionId] = true;
    st.sectionIndex = nextIndex;
    saveChapter(subject, chapterId, st);
    return st;
  }

  function hasLesson(subject) {
    if (!subject || subject.id !== "ai-ontology-intro") return false;
    if (typeof LESSON_DATA === "undefined" || !LESSON_DATA.chapters) return false;
    return Object.keys(LESSON_DATA.chapters).some((id) => {
      const ch = LESSON_DATA.chapters[id];
      return ch && Array.isArray(ch.sections) && ch.sections.length > 0;
    });
  }

  function chapterLesson(chapterId) {
    if (typeof LESSON_DATA === "undefined" || !LESSON_DATA.chapters) return null;
    const ch = LESSON_DATA.chapters[chapterId];
    if (!ch || !Array.isArray(ch.sections) || !ch.sections.length) return null;
    return ch;
  }

  function lessonComplete(subject, chapterId) {
    const lesson = chapterLesson(chapterId);
    if (!lesson || !Array.isArray(lesson.sections)) return false;
    const st = chapterState(subject, chapterId);
    return lesson.sections.every((s) => st.doneSectionIds[s.id]);
  }

  return {
    lessonKey,
    chapterState,
    markSectionDone,
    hasLesson,
    chapterLesson,
    lessonComplete,
  };
})();
