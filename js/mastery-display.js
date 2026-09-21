/**
 * 習得の見え方のみ（表示専用）。
 * 段位・q・章クリア・マスタ・成績の計算は触らない。
 * 第7回部長会議採択: 絶対数を主・%は従／分母増加時の一言注記。
 * 文言根拠: docs/RELEASE_BELL_DRAFT.md スタンバイ／CS_REPLY_TEMPLATES.md 節7。
 */
const MasteryDisplay = (function () {
  const SEEN_COUNT_KEY = "biz_dojo_ui_seen_qcount_v1";
  /** 出荷前の既知件数（初回シード用・表示注記のみ。成績ロジック非接触） */
  const PRIOR_PUBLISHED_COUNT = {
    "ai-ontology-intro": 50,
    "ai-ontology-core": 101,
  };
  /**
   * スズメ調UI注記（CS節7／ベルスタンバイを短文化）。
   * 避けた言い方: バグ・不具合・直します・すぐに元に戻る・造語・有料誘導。
   */
  const DENOM_GROWTH_NOTE =
    "問題が増えたため、習得％が以前より低く見えることがあります。これまで解いた記録は残っています。";

  function readSeenMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_COUNT_KEY) || "{}");
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function writeSeenMap(map) {
    try {
      localStorage.setItem(SEEN_COUNT_KEY, JSON.stringify(map || {}));
    } catch (e) {
      /* ignore quota */
    }
  }

  /**
   * 絶対数を主、%は従の文言。
   * @returns {{ primary: string, secondary: string, pct: number, plain: string, html: string }}
   */
  function formatMastery(mastered, total) {
    const m = Math.max(0, Number(mastered) || 0);
    const t = Math.max(0, Number(total) || 0);
    if (t <= 0) {
      return {
        primary: "全0問",
        secondary: "",
        pct: 0,
        plain: "全0問",
        html: "全0問",
      };
    }
    const pct = Math.round((m / t) * 100);
    const primary = `習得 ${m}/${t}`;
    const secondary = `${pct}%`;
    return {
      primary,
      secondary,
      pct,
      plain: `${primary}（${secondary}）`,
      html:
        primary +
        `<span class="mastery-pct-secondary">（${secondary}）</span>`,
    };
  }

  /**
   * 分母（問題総数）が前回表示より増えたときだけ注記。一度出したら件数を記録して消す。
   * hasProgress: 既存学習者向け（未プレイには出さない）。
   */
  function denomGrowthNote(subjectId, total, hasProgress) {
    const id = subjectId ? String(subjectId) : "";
    const t = Math.max(0, Number(total) || 0);
    if (!id || t <= 0) return "";
    const map = readSeenMap();
    const prev = Number(map[id]) || 0;

    if (prev <= 0) {
      const baseline = Number(PRIOR_PUBLISHED_COUNT[id]) || 0;
      if (baseline > 0 && t > baseline && hasProgress) {
        map[id] = t;
        writeSeenMap(map);
        return DENOM_GROWTH_NOTE;
      }
      map[id] = t;
      writeSeenMap(map);
      return "";
    }

    if (t > prev && hasProgress) {
      map[id] = t;
      writeSeenMap(map);
      return DENOM_GROWTH_NOTE;
    }

    if (t !== prev) {
      map[id] = t;
      writeSeenMap(map);
    }
    return "";
  }

  /** シカ確認メモ用: 計算式は不変（表示の並べ方だけ） */
  function meaningUnchangedMemo() {
    return {
      mastered: "選択式2回連続正解の件数（既存どおり）",
      total: "現在の問題総数（既存どおり）",
      pct: "round(mastered/total*100)（既存どおり）",
      note: "分母増時の注記と表示順のみ。段位・q・章クリア非接触",
    };
  }

  return {
    SEEN_COUNT_KEY,
    DENOM_GROWTH_NOTE,
    formatMastery,
    denomGrowthNote,
    meaningUnchangedMemo,
  };
})();
