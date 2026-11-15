//
// ミックス出題の画面 (第3段)。開いている科目のホームの 出題設定 の中に、
// 混ぜる科目の一覧を置く。新しい画面を立てないのは、出題数・出題対象・
// 開始ボタンがそのまま要るからで、ミックスは「出題設定に科目が増えた形」
// として足すのがいちばん手数が少ない。
//
// 一覧の規則 (listRowsFrom) は DOM も大域も読まない。札と既定の印を
// 決めるのはこの関数1つで、画面はその答えを描くだけにする。
//
// 読み込む量の実測 (2026-11-15)。自前の3科目は 1問あたり 1,303 から
// 2,345バイト で、13科目の問題数の合計は 7,862問 である。つまり全科目を
// 素で読むと 9.8MB から 17.6MB になる (docs/MIX_MODE_DESIGN.md の
// 8MB前後 という見積りは低い)。sap だけで 4,951問 = 全体の63パーセントを
// 占める。だから一覧には科目ごとの問題数を出し、選んだ合計も出す。
// 外す印は、ここで元を取る。
//
const MixUI = (function () {
  // 選んだ問題数がこれを超えたら、読み込みが長いことを画面に書く。
  // sap (4,951問) を外せば下回る水準に置いてある。
  const HEAVY_QUESTION_COUNT = 2000;

  function titleOf(row) {
    if (!row) return "";
    return String(row.shortTitle || row.title || row.id || "");
  }

  // 一覧に出す科目と、その札を決める規則。
  //
  // 権利の無い有料科目も一覧に出す。無料ぶんは科目ごとに1日20問なので、
  // 混ぜても今日その科目で解ける数は変わらない (枠の足し算は
  // Entitlement.mixedQuotaCaps が持つ)。一覧から外すと、1科目ずつなら
  // 解けていた20問が、ミックスからは触れなくなる。
  // 今日のぶんを使い切った科目だけ、印を外して選べなくする。
  function listRowsFrom(rows, opts) {
    const o = opts || {};
    const currentId = o.currentId ? String(o.currentId) : "";
    const counts = o.counts || {};
    const hasAccess = typeof o.hasAccess === "function" ? o.hasAccess : null;
    const remaining = typeof o.remainingFree === "function" ? o.remainingFree : null;
    const quotaLabel = typeof o.quotaLabel === "function" ? o.quotaLabel : null;
    const open = [];
    const usable = [];
    const spent = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || !row.id || row.enabled === false) return;
      const id = String(row.id);
      const out = {
        id: id,
        title: titleOf(row),
        count: Number(counts[id]) || 0,
        state: "",
        note: "",
        checked: true,
        selectable: true,
      };
      if (id === currentId) {
        out.state = "current";
        out.note = "開いている科目";
        out.selectable = false;
        open.push(out);
        return;
      }
      if (hasAccess && hasAccess(id)) {
        out.state = "owned";
        usable.push(out);
        return;
      }
      const rem = remaining ? remaining(id) : 0;
      if (rem > 0) {
        out.state = "quota";
        out.note = quotaLabel ? quotaLabel(rem) : "";
        usable.push(out);
        return;
      }
      out.state = "exhausted";
      out.note = "本日の無料ぶんは終了";
      out.checked = false;
      out.selectable = false;
      spent.push(out);
    });
    return open.concat(usable, spent);
  }

  // 選ばれた科目の問題数の合計と、読み込みが長いかどうか。
  function selectionSummary(listRows, selectedIds) {
    const picked = Object.create(null);
    (Array.isArray(selectedIds) ? selectedIds : []).forEach((id) => {
      if (id) picked[String(id)] = true;
    });
    let subjects = 0;
    let questions = 0;
    (Array.isArray(listRows) ? listRows : []).forEach((row) => {
      if (!row || !picked[row.id]) return;
      subjects++;
      questions += Number(row.count) || 0;
    });
    return {
      subjects: subjects,
      questions: questions,
      heavy: questions > HEAVY_QUESTION_COUNT,
    };
  }

  // 他科目から来た問題の札を決める。
  //
  // 分野の表 (CATEGORIES) は開いている科目のものしか無い。だからミックス中に
  // 他科目の問題が出ると、札が素の分野キー (tcode) のまま出る。2026-11-15 に
  // 本物の Chromium で実測した: 科目B を開いたまま sap の問題を1問流すと、
  // 札は tcode と ★★★ 最優先 の2つで、どの科目の問題かは画面のどこにも
  // 出ていなかった。混ぜたときにいちばん知りたいのはそこである。
  //
  // だから他科目の問題では、読めない分野キーの代わりに科目の題を出す。
  // 分野キーが開いている科目の表にも在る場合 (3科目とも scenario のような
  // 形) だけ、分野の札も足す。
  //
  // 開いている科目の問題では null を返す。呼び元は従来どおりの札を描く。
  function foreignBadges(q, ctx) {
    const o = ctx || {};
    const sid = q && q.subjectId ? String(q.subjectId) : "";
    const openId = o.currentId ? String(o.currentId) : "";
    if (!sid || !openId || sid === openId) return null;
    const e = (q && q.entry) || {};
    const cats = o.categories || {};
    const prios = o.priorities || {};
    const out = [
      {
        kind: "subject",
        text: typeof o.titleOf === "function" ? o.titleOf(sid) || sid : sid,
      },
    ];
