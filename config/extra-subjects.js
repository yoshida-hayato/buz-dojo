// ビジネス道場が自分で問題データを持つ科目の宣言 (レジストリの2枚目)。
//
// なぜ2枚目が要るか: subjects/registry.js は自動パッチの対象外である
// (ブリッジの resolve_target が subjects/ 配下で subject.js しか受け付けない)。
// だから社員はレジストリに行を足せない。社長が 2026-11-01 11:31 に、
// 公開情報の科目にかぎり問題データをビジネス道場側に置くことを許したので、
// その科目の宣言だけをここに置く。マスタが外に在る10科目は1行も動かさない。
//
// 約束: ここに在る行は registry の行と同じ形を持ち、同じ配線 (料金・帯・
// 静的頁・成績キー・静的な題) を全部そろえる。足し忘れは
// functions/__tests__/extra-subject-wiring.test.js が名指しで落とす。
// id は registry と重ならない。
//
// 読む順番: index.html の CORE で subjects/registry.js の直後に読む。
// SUBJECT_REGISTRY は古典 script の最上位の const なので window の属性では
// ないが、同じ大域の語彙環境に居るので、ここから配列として触れる。
// 代入はしない (別の器に差し替えると、既に参照を持った側が古い配列を見る)。
// 足すのは push だけである。
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ExtraSubjects = api;
  if (typeof SUBJECT_REGISTRY !== "undefined" && Array.isArray(SUBJECT_REGISTRY)) {
    api.mergeInto(SUBJECT_REGISTRY);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // 自前の問題データを持つ科目。contentBase はこのドメインの相対パスにする。
  const EXTRA_SUBJECTS = [
    {
      id: "fe-kamoku-b",
      title: "基本情報 科目B",
      shortTitle: "科目B",
      description:
        "擬似言語のトレースと情報セキュリティ。基本情報技術者試験の科目Bの出題形式にそろえた自作問題です",
      path: "subjects/fe-kamoku-b",
      contentBase: "/data/fe-kamoku-b",
      contentMaster: "ビジネス道場（自前の問題データ）",
      enabled: true,
      accent: "#b45309",
      depthTier: "depth",
      cardEyebrow: "応用・判断",
    },
    {
      id: "fe-kamoku-a",
      title: "基本情報 科目A",
      shortTitle: "科目A",
      description:
        "情報処理推進機構が公表した科目Aの公開問題そのもの。8分野の四肢択一を出典つきで演習できます",
      path: "subjects/fe-kamoku-a",
      contentBase: "/data/fe-kamoku-a",
      contentMaster: "情報処理推進機構（公開問題）",
      examLicenseKey: "ipa-joho-shori",
      enabled: true,
      accent: "#0f766e",
      depthTier: "basic",
      cardEyebrow: "基礎・知識",
    },
  ];

  // 足す側の中身を引数で受ける純粋な形にしてある。
  // 理由: 一覧が空のうちは、一覧を回す約束をテストで1つも確かめられない。
  // EXTRA_SUBJECTS を直に読む形だと、重複を見る行を消しても、
  // id の無い行を通す形に変えても、空のあいだは見張りが素通りする
  // (2026-11-01 12:48便 に実測。11通りに壊して4通りが素通りした)。
  // だから本物の行を注入して測れる口を開けておく。

  // list に、重複しない rows だけを足す。list そのものに push する。
  // 差し替えないのは、既に参照を持った側 (読み込み済みの画面) が
  // 古い配列を見続けないようにするため。
  function mergeRows(list, rows) {
    if (!Array.isArray(list)) return list;
    if (!Array.isArray(rows)) return list;
    const seen = {};
    list.forEach(function (row) {
      if (row && row.id) seen[row.id] = true;
    });
    rows.forEach(function (row) {
      if (!row || !row.id) return;
      if (seen[row.id]) return;
      seen[row.id] = true;
      list.push(row);
    });
    return list;
  }

  function idsOf(rows) {
    const out = [];
    if (!Array.isArray(rows)) return out;
    rows.forEach(function (row) {
      if (row && row.id) out.push(row.id);
    });
    return out;
  }

  function mergeInto(list) {
    return mergeRows(list, EXTRA_SUBJECTS);
  }

  function ids() {
    return idsOf(EXTRA_SUBJECTS);
  }

  return {
    EXTRA_SUBJECTS: EXTRA_SUBJECTS,
    mergeRows: mergeRows,
    idsOf: idsOf,
    mergeInto: mergeInto,
    ids: ids,
  };
});
