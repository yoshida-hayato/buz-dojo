//
// ビジキャリの試験日と申込受付期間から、Xの毎日投稿に差し込む1行を作る純関数。
// 日程の出典は中央職業能力開発協会の令和8年度試験日程ページ(2026-10-03 確認)。
// 判定は JST の暦日。依存なし・副作用なし。詳しい経緯は docs/AGENT_LEARNING_LOG.md。
//

const EXAM_DATES = ["2026-10-04", "2027-02-14"];

// from と to は両端を含む
const APPLICATION_PERIODS = [
  { from: "2026-04-20", to: "2026-07-10", examDate: "2026-10-04" },
  { from: "2026-10-05", to: "2026-12-04", examDate: "2027-02-14" },
];

// サイトのカウントダウンと同じ60日
const COUNTDOWN_MAX_DAYS = 60;

const MS_PER_DAY = 86400000;
const JST_OFFSET_MS = 32400000;

function dayMs(isoDate) {
  const parts = String(isoDate).split("-");
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function jstDayMs(now) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const d = new Date(t + JST_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function shortDate(isoDate) {
  const parts = String(isoDate).split("-");
  return Number(parts[1]) + "/" + Number(parts[2]);
}

// 優先順: 試験当日 > 申込受付期間中 > 試験までのカウントダウン。無ければ null
function examNoticeLine(now = new Date()) {
  const today = jstDayMs(now);
  for (const iso of EXAM_DATES) {
    if (dayMs(iso) === today) return "本日がビジキャリ試験日です";
  }
  for (const p of APPLICATION_PERIODS) {
    if (today >= dayMs(p.from) && today <= dayMs(p.to)) {
      return "次回ビジキャリは" + shortDate(p.examDate) + "、申込は" + shortDate(p.to) + "まで";
    }
  }
  for (const iso of EXAM_DATES) {
    const days = Math.round((dayMs(iso) - today) / MS_PER_DAY);
    if (days >= 1 && days <= COUNTDOWN_MAX_DAYS) {
      return "ビジキャリ試験まであと" + days + "日";
    }
  }
  return null;
}

module.exports = { EXAM_DATES, APPLICATION_PERIODS, COUNTDOWN_MAX_DAYS, examNoticeLine };
