//
// ミックス出題のひと回ぶんを組み立てる所 (第3段)。
//
// 選ばれた科目を1本ずつ読む。全部まとめて読まないのは、素で読むと
// 9.8MB から 17.6MB になるためで (2026-11-15 に実測。内訳は
// docs/MIX_MODE_DESIGN.md)、1本読み終わるたびに進み具合を返して、
// 読めた科目から混ぜられるようにする。
//
// 読む口は SubjectLoader.loadSubjectData にする。loadSubject ではない。
// loadSubject は1本読むたびに SUBJECT と QUIZ_DATA と CHANGELOG と
// 選択中の科目 と loadedId の5つを動かすので、12科目を順に読むと
// 利用者が選んでいた科目が最後の1本に置き換わる (2026-11-15 に実測)。
//
// 依頼 (deps) は引数で受ける。DOM も fetch も大域も直には触らないので、
// 見張りが本物の規則をそのまま走らせられる。
//
const MixSession = (function () {
  function depsOrDefault(deps) {
    const d = deps || {};
    const loader =
      d.loadSubjectData ||
      (typeof SubjectLoader !== "undefined" && SubjectLoader.loadSubjectData
        ? SubjectLoader.loadSubjectData
        : null);
    const sets =
      d.selectionSetsFor ||
      (typeof QuizStorage !== "undefined" && QuizStorage.selectionSetsFor
        ? function (id) {
            return QuizStorage.selectionSetsFor(id);
          }
        : null);
    return {
      loadSubjectData: loader,
      selectionSetsFor: sets,
      onProgress: typeof d.onProgress === "function" ? d.onProgress : function () {},
    };
  }

  function reason(e) {
    if (!e) return "読み込みに失敗しました";
    return String(e.message || e) || "読み込みに失敗しました";
  }

  // 1本ぶんの集合を作る。buildMixedPoolFrom がそのまま受ける形にする。
  //
  // inputCategories は渡さない。buildMixedPoolFrom が解答方式を選択式に
  // 固定するので、渡しても結果が1件も動かない (2026-11-15 に実測)。
  // 動かない値を渡すと、次の人が「要らない」と読んで本物のほうを消す筋に
  // なる (00:48便 の件)。
  //
  // 問題データは data.quiz 1つで足りる。正誤・並べ替え・対比の3つは
  // fetchQuizBundle が id で重複を外して quiz に足し終えている。
  function sourceFrom(subjectId, data, sets) {
    const s = sets || {};
    return {
      subjectId: subjectId,
      entries: data && Array.isArray(data.quiz) ? data.quiz : [],
      choiceMastered: s.choiceMastered || new Set(),
      inputMastered: s.inputMastered || new Set(),
      wrongIds: s.wrongIds || new Set(),
      answeredIds: s.answeredIds || new Set(),
    };
  }

  // 読めなかった科目は飛ばす。1本でも投げたら全部やめる形にはしない。
  // よその repo にマスタが在る科目は、こちらの手の届かない理由で落ちうる
  // ので、落ちた1本でミックスそのものが始まらないほうが損である。
  async function collectSources(subjectIds, deps) {
    const raw = Array.isArray(subjectIds) ? subjectIds : [];
    const ids = [];
    const seen = Object.create(null);
    raw.forEach(function (v) {
      const id = v ? String(v) : "";
      if (!id || seen[id]) return;
      seen[id] = true;
      ids.push(id);
    });
    const d = depsOrDefault(deps);
    const total = ids.length;
    const sources = [];
    const failed = [];
    for (let i = 0; i < total; i++) {
      const id = ids[i];
      d.onProgress({ phase: "loading", subjectId: id, done: i, total: total });
      try {
        if (!d.loadSubjectData) throw new Error("科目を読む口がありません");
        const data = await d.loadSubjectData(id);
        const src = sourceFrom(
          id,
          data,
          d.selectionSetsFor ? d.selectionSetsFor(id) : null
        );
        if (!src.entries.length) throw new Error("問題が0件です");
        sources.push(src);
        d.onProgress({
          phase: "loaded",
          subjectId: id,
          done: i + 1,
          total: total,
          count: src.entries.length,
        });
      } catch (e) {
        failed.push({ subjectId: id, message: reason(e) });
        d.onProgress({
          phase: "failed",
          subjectId: id,
          done: i + 1,
          total: total,
          message: reason(e),
        });
      }
    }
    d.onProgress({
      phase: "done",
      done: total,
      total: total,
      loaded: sources.length,
      failed: failed.length,
    });
    return { sources: sources, failed: failed };
  }

  return { collectSources: collectSources, sourceFrom: sourceFrom };
})();

if (typeof window !== "undefined") window.MixSession = MixSession;
